function main() {
  // The main logic will go here
  console.log("Main function has been called.");
}

function init() {
  const startButton = document.createElement('button');
  startButton.textContent = 'Start';

  startButton.addEventListener('click', () => {
    startButton.remove();
    main();
  }, { once: true });

  document.body.appendChild(startButton);
}

window.addEventListener('DOMContentLoaded', init);