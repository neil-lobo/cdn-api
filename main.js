const express = require("express")
const vhost = require("vhost")
require("dotenv").config();

if (process.env.ENV == "prod") {
    express()
        .use(vhost("cdn.techno.icu", require("./index.js").app))
        .listen(process.env.PORT, () => {
            console.log(`[PROD] Listening on port: ${process.env.PORT}`)
        })
} else {
    express()
        .use(vhost("localhost", require("./index.js").app))
        .listen(process.env.PORT, () => {
            console.log(`[DEV] Listening on port: ${process.env.PORT}`)
        })
}