import { Presenter } from "./modules/presenter.mjs"
import { Conference } from "./modules/conference.mjs";
import { Chat } from "./modules/chat.mjs";

// Configurations
const hostURL = "http://localhost:8080"
const CHAT_REFRESH_MS = 500;
const socket = io(hostURL);

// Elements
const joinRoomButton = document.getElementById("join_room_button");
const createRoomButton = document.getElementById("create_room_button");
const sendMessageButton = document.getElementById("sendMessage");
const chatBox = document.getElementById("chat-display");

// Globals
const presenter = new Presenter();
const conference = new Conference(socket, presenter);
const chat = new Chat(chatBox, hostURL, presenter);
let login = true;

// Events
joinRoomButton.onclick = joinRoom;
createRoomButton.onclick = createRoom;
sendMessageButton.onclick = sendMessage;

window.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();

        if(login)
            joinRoomButton.click();
        else
            sendMessageButton.click();
    }
});


// ========== CALL HANDLERS ==========

function joinRoom(e) {
    console.log("Sending request to join");

    let username = presenter.getUsername();
    let roomId = presenter.getRoomId();

    if (usernameIsValid(username)) {
        presenter.showInputError("Please enter a valid username.");
    }
    else {
        login = false;
        chat.setUser(username, roomId);
        conference.connect(username, roomId);
    }

    // periodically refresh chat showing new messages
    // use a lambda for the class context to work
    setInterval(() => chat.refreshChat(), CHAT_REFRESH_MS);
    e.preventDefault();
}

function createRoom(e) {
    // send to socket
    fetch(hostURL + "/room/create", { method: "GET" })
        .then(res => res.json())
        .then(response => {
            // place the roomId into the room input area
            let roomInput = document.getElementById("room_input");
            roomInput.value = response.room;
        });
    e.preventDefault();
}


// ========== CHAT HANDLERS ==========

function sendMessage() {
    // Send any field that is filled
    let text = presenter.getChatText();
    if (text.trim() !== "") {
        chat.sendText(text);
    }

    for (let file of presenter.getChatFiles()) {
        if (file) {
            chat.sendFile(file, "File");
        }
    }

    presenter.resetChatInputs();
}

// General functions
function usernameIsValid(username) {
    // check if is whitespace
    return username.trim().length === 0;
}
