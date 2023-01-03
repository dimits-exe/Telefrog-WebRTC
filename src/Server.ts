import express, {Request, Response} from "express";
import fs from "fs";
import * as ht from "http";
import s from "socket.io";
import path from "path";
import * as logging from "./logging";
import {Message} from "./messages";
import {constructMessage, flushUploads, getNewMessages, getUniqueRoomId, storeMessage} from "./routes";
import multer, {FileFilterCallback} from "multer";
import {randomUUID} from "crypto";
import {Buffer} from "buffer";
import {findName, getUserByName, register, signin, updateUser} from "./mongussy";
import {User} from "./model/User";

// Create the server
const PORT = 8080;
const app = express();
const http = new ht.Server(app);
const io = new s.Server(http, {
    maxHttpBufferSize: 10 * 1024 * 1024
});

const sessions: Map<string, string> = new Map<string, string>();
const storage = multer.diskStorage({
    destination: function (req: Request, file: Express.Multer.File, cb) {
        if (req.path === "/user/update") {
            let session = req.body.sessionId;
            if (sessions.has(session)) {
                let username = sessions.get(session);
                if (username !== undefined) {
                    let paths = path.join(__dirname, `../uploads/${username}/`)
                    if (!fs.existsSync(paths))
                        fs.mkdirSync(paths);
                    cb(null, paths);
                } else {
                    cb(new Error("Username could not be resolved"), "../uploads");
                }
            } else {
                cb(new Error("Session id does not exist"), "../uploads")
            }
        } else {
            let paths = path.join(__dirname, `../uploads/${req.body.roomId}/`)
            if (!fs.existsSync(paths))
                fs.mkdirSync(paths);
            cb(null, paths);
        }
    }, filename: function (req: Request, file: Express.Multer.File, cb) {
        if (req.path === "/user") {
            let name = file.originalname.split(".")
            let suffix = name[name.length - 1];
            cb(null, `profile.${suffix}`);
        } else {
            let name = Buffer.from(file.originalname, "latin1").toString(`utf8`)
            cb(null, `${randomUUID()}~${name}`);
        }
    }
});


const upload = multer({
    storage, fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
        if (req.body.messageType === "Text") {
            cb(null, false);
        } else {
            cb(null, true);
        }
    }
})

app.use(express.json({limit: "10mb"}));
app.use(express.urlencoded({extended: true, limit: "10mb"}));
//Define where the static html content will be found.
app.use("/static", express.static(path.join(__dirname, "../static")));
app.use("/media", express.static(path.join(__dirname, "../uploads")));
//This method redirects you to the html page when you enter localhost:8080

// This is a file logger, if you want to change the path take into account that this will run from out/Server.js
export const log = new logging.FileLog(path.join(__dirname, "../logging.txt"));
//You can use the console version
// export const log=new logging.ConsoleLog();
const rooms: string[] = [];
const people: Map<string, number> = new Map<string, number>();
const chats: Map<string, Message[]> = new Map<string, Message[]>();

app.get("/", (req: Request, res: Response) => {
    res.redirect("/static/index.html");
})

app.get("/room/create", (req: Request, res: Response) => {
    // Create room id
    const room: string = getUniqueRoomId(rooms);
    people.set(room, 0);
    chats.set(room, []);
    log.i("Created room " + room);
    res.status(200).send({room});
})

//Socket io connections
io.on("connection", socket => {
    socket.on("join", roomObj => {
        if (rooms.filter(value => roomObj.room === value).length === 0) {
            socket.emit("join-status", 404, "Room not found");
        } else {
            log.i(`Attempt from user ${roomObj.username} to join room ${roomObj.room}`);
            socket.join(roomObj.room);
            let person_count = people.get(roomObj.room);
            if (person_count != undefined) {
                people.set(roomObj.room, person_count + 1)
                socket.to(roomObj.room).emit("user-connected", roomObj.username, roomObj.peer);
                socket.on("disconnect", () => {
                    flushUploads(people, roomObj);
                    socket.to(roomObj.room).emit("user-disconnected", roomObj.username, roomObj.peer);
                });
                socket.emit("join-status", 200, "OK");
            }
        }
    });
})

//Callback to refresh the 
app.get("/chat-box/refresh", async (req: Request, res: Response) => {
    const room = String(req.query.roomId);
    const last_message = String(req.query.lastMessage);
    try {
        let toSend = await getNewMessages(chats, room, last_message)
        res.status(200).json(toSend)
    } catch (e: any) {
        log.c(e.message)
    }
});


//Route for reading new Data
app.post("/chat-box/message/new", upload.single("content"), (req: Request, res: Response) => {
    let message;
    let roomId = req.body.roomId;
    if (req.body.messageType === "Text") {
        message = constructMessage(req.body.username, req.body.messageType, req.body.content);
        storeMessage(roomId, res, message, chats, log);
    } else {
        if (req.file === undefined) {
            res.status(400).send("File could not be uploaded");
        } else {
            message = constructMessage(req.body.username, req.body.messageType, req.file.filename);
            storeMessage(roomId, res, message, chats, log);
        }
    }
})


app.post("/user/update", upload.single("profilePic"), async (req: Request, res: Response) => {
    log.i(`Request to register user with id ${req.body.username}`);
    try {
        let session = req.body.sessionId;
        if (sessions.has(session)) {
            const username = sessions.get(session);
            let exists: number = 0;
            if (username !== undefined) {
                exists = await findName(username);
                if (exists === 1) {
                    let filename: string;
                    if (req.file === undefined) {
                        filename = "";
                    } else {
                        let name = req.file.path.split("\\");
                        filename = name[name.length - 2] + "\\" + name[name.length - 1];
                    }
                    await updateUser(new User(username, "", req.body.email, filename, req.body.aboutMe));
                    res.sendStatus(200)
                } else {
                    log.c(`username ${req.body.username} already exists`)
                    res.sendStatus(409)
                }
            } else {
                log.c(`username ${req.body.username} already exists`)
                res.sendStatus(409)
            }
        }
    } catch (e) {
        log.c(String(e));
        res.sendStatus(400)
    }
});

app.post("/user", upload.any(), async (req, res) => {
    let pass = req.body.password;
    let username = req.body.username;
    let email = req.body.email;
    let exist = await findName(username);
    if (exist < 1) {
        await register(new User(username, pass, email))
        const re = randomUUID()
        sessions.set(re, username)
        res.status(200).json({sessionId: re})
    } else {
        log.c(`Username ${username} already exists.`)
        res.sendStatus(400)
    }

})

app.post("/user/login", async (req, res) => {
    let pass = req.body.password;
    let username = req.body.username;
    try {
        let results = await signin(username, pass);
        const uuid = randomUUID();
        if (results !== null && results.length !== 0) {
            sessions.set(uuid, results.username);
            res.status(200).json(uuid)
        } else {
            log.c("Cannot get User username");
            res.sendStatus(400);

        }
    } catch (e) {
        log.c(String(e))
        res.sendStatus(400);
    }
});


app.post("user/logout", (req, res) => {
    let session = req.body.sessionId;
    sessions.delete(session);
    res.sendStatus(200)
})


fs.readdir(path.join(__dirname, "../uploads"), (err, files) => {
    if (!err) {
        for (const i of files) {
            if (fs.lstatSync(path.join(__dirname, "../uploads", i)).isDirectory()) {
                fs.rmSync(path.join(__dirname, "../uploads", i), {recursive: true, force: true});
            } else {
                fs.unlinkSync(path.join(__dirname, "../uploads", i));
            }
        }
    } else {
        log.c(err.message);
    }
    log.i("cleaned the upload folder");
})

app.get("/user/:sessionId", async (req, res) => {
    let session = req.params.sessionId;
    try {
        if (sessions.has(session)) {
            let username = sessions.get(session);
            if (username !== undefined) {
                let results = await getUserByName(username);
                if (results !== null) {
                    res.status(200).json(results)
                } else {
                    log.c("User could not be found");
                    res.sendStatus(400);
                }
            }
        }
    } catch (e) {
        log.c(String(e))
        res.sendStatus(400);
    }
})

process.on('uncaughtException', function (err) {
    console.log('Caught exception: ' + err);
});

http.listen(PORT, () => {
    log.i(`Server initialization at port ${PORT}`);
    console.log(`Server initialization at port ${PORT}`)
});

