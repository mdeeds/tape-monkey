// @ts-check

/**
 * @class ChatInterfaceUI
 * @description Manages a popup window for chat interactions.
 */
export class ChatInterfaceUI {
  #popup = null;
  #messageContainer = null;

  /**
   * @private
   * @constructor
   * @param {Window} popup
   * @param {HTMLElement} messageContainer
   */
  constructor(popup, messageContainer) {
    this.#popup = popup;
    this.#messageContainer = messageContainer;
  }

  /**
   * Asynchronously creates and initializes a ChatInterfaceUI instance in a new popup window.
   * @param {string} title The title for the popup window.
   * @returns {Promise<ChatInterfaceUI>}
   */
  static create(title) {
    return new Promise((resolve, reject) => {
      const popup = window.open('', '_blank', 'width=500,height=700,scrollbars=no,resizable=yes');
      if (!popup) {
        return reject(new Error("Failed to open popup window. Please allow popups for this site."));
      }

      // Keep a reference to the window that is opening the popup.
      const openerWindow = window;

      const setupPopup = () => {
        popup.openerWindow = openerWindow;

        const styleSheet = popup.document.createElement('link');
        styleSheet.rel = 'stylesheet';
        styleSheet.href = 'view/style.css';
        popup.document.head.appendChild(styleSheet);

        popup.document.body.innerHTML = `
          <div id="messages"></div>
          <div id="input-container">
            <textarea id="chat-input" rows="2" placeholder="Type your message..."></textarea>
            <button id="send-btn">Send</button>
          </div>
        `;

        const messageContainer = popup.document.getElementById('messages');
        const inputArea = /** @type {HTMLTextAreaElement} */ (popup.document.getElementById('chat-input'));
        const sendButton = popup.document.getElementById('send-btn');

        const chatUI = new ChatInterfaceUI(popup, messageContainer);

        const sendMessage = () => {
          const text = inputArea.value.trim();
          if (text) {
            chatUI.addUserMessage(text);
            // Post the message back to the window that opened the popup
            popup.openerWindow.postMessage(text, popup.openerWindow.location.origin);
            inputArea.value = '';
            inputArea.focus();
          }
        };

        sendButton.addEventListener('click', sendMessage);
        inputArea.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
          }
        });

        popup.document.title = title;
        resolve(chatUI);
      };

      // Handle a race condition where the load event might fire before the listener is attached
      if (popup.document.readyState === 'complete') {
        setupPopup();
      } else {
        popup.addEventListener('load', setupPopup);
      }

      // Handle the case where the user closes the popup before it loads
      const checkPopupClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopupClosed);
          reject(new Error("Popup window was closed by the user."));
        }
      }, 500);
    });
  }

  /**
   * Adds a message from the user to the chat window.
   * @param {string} message 
   */
  addUserMessage(message) {
    this.#addMessage(message, 'user-message');
  }

  /**
   * Adds a message from the agent/LLM to the chat window.
   * @param {string} message 
   */
  addAgentMessage(message) {
    this.#addMessage(message, 'agent-message');
  }

  /**
   * @private
   * @param {string} message
   * @param {string} className
   */
  #addMessage(message, className) {
    if (this.#popup && !this.#popup.closed && this.#messageContainer) {
      const messageDiv = this.#popup.document.createElement('div');
      messageDiv.classList.add('message', className);
      messageDiv.textContent = message;
      this.#messageContainer.appendChild(messageDiv);
      this.#messageContainer.scrollTop = this.#messageContainer.scrollHeight;
    }
  }
}