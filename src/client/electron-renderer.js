const information = document.getElementById('info');
information.innerText = `This app is using Chrome (v${window.versions.chrome()}), ` +
  `Node.js (v${window.versions.node()}), and Electron (v${window.versions.electron()})`;

async function pingTest() {
  const response = await window.versions.ping();
  console.log(response); // prints out 'pong'
}

pingTest();

document.getElementById('fullscreen').onclick = function () {
  window.myapi.fullscreenToggle();
};

document.getElementById('devtools').onclick = function () {
  window.myapi.openDevTools();
};

document.getElementById('crash').onclick = function () {
  window.myapi.crash();
};

document.getElementById('crashmain').onclick = function () {
  window.myapi.crashMain();
};
