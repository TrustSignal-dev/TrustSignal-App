import { createApp, createServices } from "../src/server";

const app = createApp(createServices());

export default app;
module.exports = app;
