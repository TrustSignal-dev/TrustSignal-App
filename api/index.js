/* global require, module */
"use strict";

const { createApp, createServices } = require("../dist/server.bundle.cjs");

const app = createApp(createServices());

module.exports = app;
