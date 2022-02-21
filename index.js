const MAP = ['0','1','2','3','4','5','6','7','8','9','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']
const express = require("express");
const multer  = require('multer')
const bodyParser = require('body-parser');

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

app.use(express.static("imgs"));
app.use(bodyParser.urlencoded({ extended: false }))

app.get("/", (req, res) => {
    res.sendFile("index.html", { root: __dirname })
})

app.post("/upload", (req,res) => {
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
        
        console.log("POST");
        const data = {
            error: null,
            message: "Image uploaded!",
            fileName: req.file.filename
        }
        res.status(200).json(data);
    })

})
exports.app = app;