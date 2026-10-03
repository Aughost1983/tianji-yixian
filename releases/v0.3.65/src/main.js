import { App } from "./ui/app.js?v=v0.3.65";

const root = document.getElementById("app");
const app = new App(root);
app.start();
window.__TIANJI__ = app;
