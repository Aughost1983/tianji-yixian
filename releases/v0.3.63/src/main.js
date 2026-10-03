import { App } from "./ui/app.js";

const root = document.getElementById("app");
const app = new App(root);
app.start();
window.__TIANJI__ = app;
