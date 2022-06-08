const MAP = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']
const util = require("util");
const getFolderSize = util.promisify(require("get-folder-size"));
const express = require("express");
const multer  = require('multer')
const bodyParser = require('body-parser');
const uuid = require("uuid");
const mariadb = require('mariadb');
const fetch = require("node-fetch");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: "IMG_UPLOADER",
    connectionLimit: 5
})

const app = express();
const opts = {
    storage: multer.diskStorage({
        destination: function(req, file, cb) {
            cb(null, "./imgs")
        },
        filename: function(req, file, cb) {
            let id = '';
            for(let i = 0; i < 7; i++){
                let char = MAP[Math.floor(Math.random()*62)];
                id += char;
            }
            cb(null, `${id}.png`)
        }
    }),
    fileFilter: function(req, file, cb) {
        const accepted = ["image/png", "image/jpeg"];
        if (accepted.includes(file.mimetype)){
            cb(null, true);
        } else {
            cb(null, false);
        }
    }
}
const upload = multer(opts).single("file")

async function queryDB(query) {
    let conn;
    let rows;
    try {
        conn = await pool.getConnection();
        rows = await conn.query(query);
    } finally {
        if (conn) {
            conn.release();
        }
    }
    return rows;
}

async function multiQueryDB(queries) {
    const res = [];
    for(let query of queries) {
        res.push(await queryDB(query));
    }
    return res;
}

app.use(express.static("imgs"));
app.use("/static", express.static("static"));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false }))
app.set('view engine', 'pug')

app.get("/auth/callback", async (req, res) => {
    if (!req.query.code) {
        res.redirect("/");
        return;
    }
    const tokenRes = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${process.env.CLIENT_ID}&client_secret=${process.env.CLIENT_SECRET}&code=${req.query.code}&grant_type=authorization_code&redirect_uri=${process.env.REDIRECT_URI}`, { method: "POST" })
    const tokenData = await tokenRes.json();
    if (tokenRes.status != 200) {
        console.log(`token response: ${tokenRes.status}`)
        res.redirect("/");
        return;
    }
    // console.log("token generated")

    const userRes = await fetch("https://id.twitch.tv/oauth2/userinfo", {method: "GET", headers: {Authorization: `Bearer ${tokenData.access_token}`}})
    if (tokenRes.status != 200) {
        console.log(`user response: ${tokenRes.status}`)
        res.redirect("/");
        return;
    }
    // console.log("user data received")

    const userData = await userRes.json();
    const data = {
        "sub": userData.sub,
        "preferred_username": userData.preferred_username
    }

    jwt.sign(data, process.env.JWT_SECRET, (err, token) => {
        if (err) {
            res.redirect("/");
            console.log("err")
            return;
        }
        res.cookie("token", token, {httpOnly: true}).redirect("/");
    })
    
})

app.get("/login", (req, res) => {
    res.redirect(`https://id.twitch.tv/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${process.env.REDIRECT_URI}&response_type=code`)
})

app.get("/logout", (req, res) => {
    res.clearCookie("token").redirect("/");
})

app.get("/", (req, res) => {
    let user = null;
    if (req.cookies.token) {
        try {
            const decoded = jwt.decode(req.cookies.token);
            if (decoded) {
                user = {
                    id: decoded.sub,
                    preferred_username: decoded.preferred_username
                }
            }
        } catch(err) {
            user = null;
        }
    }

    res.render("index", {
        user: user
    })  
})

async function validKey(req, res, next) {
    if (!req.headers.authorization) {
        res.status(401).json({error: true, message: "No Authorization header found!"});
        return
    }   
    const key = req.headers.authorization.split(" ")[1]
    const rows = await queryDB(`SELECT * FROM API_KEYS WHERE \`KEY\` = '${key}'`)
    if (rows && rows[0]) {
        const res = await queryDB(`UPDATE IMG_UPLOADER.API_KEYS SET LAST_MODIFIED=current_timestamp(), CALLS=CALLS+1 WHERE ID=${rows[0].ID};`)
        next();
    } else {
        res.status(403).json({error: true, message: "Invalid API key"})
    }
}

app.post("/upload", validKey, (req,res) => {
    upload(req, res, err => {
        if (err) {
            console.log(err)
            const data = {
                error: true,
                message: "Something went wrong"
            }
            res.status(500).json(data);
            return;
        }
        
        const fileId = req.file.filename.replace(".png", "");
        console.log("POST");
        const data = {
            error: null,
            message: "Image uploaded!",
            id: fileId
        }
        res.status(200).json(data);
    })
    
})

app.get("/delete/:id", (req,res) => {
    console.log(req.headers);
    console.log(req.params)
    console.log(req.query)
    res.status(200).send();
})

async function isAdmin(req, res, next) {
    if (req.cookies.token) {
        try {
            const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
            const rows = await queryDB(`SELECT * FROM ADMINS WHERE TWITCH_ID = '${decoded.sub}'`)
            if (rows && rows[0]) {
                next();
                return;
            } else {
                res.status(403).json({error: true, message: "Forbidden!"})
                return;
            }
        } catch (err) {
            res.status(403).json({error: true, message: "Invalid token!"})
            return;
        }
    }
    res.status(401).json({error: true, message: "No token provided!"})
}

app.get("/admin", isAdmin, async (req, res) => {
    let errors = [];
    const size = await getFolderSize("./imgs");
    const queries = [
        `SELECT 
            table_name AS \`Table\`, 
            round(((data_length + index_length) / 1024 / 1024), 2) \`Size in MB\` 
        FROM information_schema.TABLES 
        WHERE table_schema = "IMG_UPLOADER"
            AND table_name IN ("API_KEYS", "ADMINS");`,
        "SELECT * FROM API_KEYS",
        "SELECT * FROM ADMINS"
    ]
    const queryRes = await multiQueryDB(queries);
    res.status(200).json({
        errors,
        "img-folder-size": `${size} bytes`,
        "table-sizes": queryRes[0],
        "api-keys": queryRes[1],
        "admins": queryRes[2]
    })
})

app.listen(process.env.PORT, () => {
    console.log(`Listening on port: ${process.env.PORT}`)
})