const MAP = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']
const express = require("express");
const multer  = require('multer')
const bodyParser = require('body-parser');
const uuid = require("uuid");
const mariadb = require('mariadb');
require("dotenv").config();
const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: "IMG_UPLOADER",
    connectionLimit: 5
})

// pool.getConnection()
// .then(async (conn) => {
//     const rows = await conn.query("SELECT * FROM API_KEYS")
//     console.log(rows[0])
// })

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

async function validKey(req, res, next) {
    if (!req.headers.authorization) {
        res.status(401).json({error: true, message: "No Authorization header found!"});
        return
    }   
    const key = req.headers.authorization.split(" ")[1]
    const rows = await queryDB(`SELECT * FROM API_KEYS WHERE \`KEY\` = '${key}'`)
    if (rows[0]) {
        next();
    } else {
        res.status(403).json({error: true, message: "Invalid API key"})
    }
}

app.use(express.static("imgs"));
app.use(bodyParser.urlencoded({ extended: false }))

app.get("/", (req, res) => {
    res.sendFile("index.html", { root: __dirname })
})

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

app.listen(process.env.PORT, () => {
    console.log(`Listening on port: ${process.env.PORT}`)
})