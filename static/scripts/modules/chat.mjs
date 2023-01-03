/**
 *  A class containing the chat messages and displaying new ones to
 *  the HTML chatbox.
 */
export class Chat {
    static NO_MESSAGES_ID = "";
    static TEMPLATES = {
        "Text": document.getElementById("text-template").textContent,
        "Image": document.getElementById("image-template").textContent,
        "File": document.getElementById("file-template").textContent
    }

    #username;
    #roomId;

    #chatboxElement;
    #hostURL;
    #presenter;
    #messages;

    /**
     * Constructs an object that posts and receives posts from the server.
     * @param {string} hostURL - The remote server's URL 
     * @param {Presenter} presenter - The presenter for the HTML page 
     */
    constructor(chatBoxElement, hostURL, presenter) {
        this.#chatboxElement = chatBoxElement;
        this.#hostURL = hostURL;
        this.#messages = [];
        this.#presenter = presenter;
    }

    /**
     * Set the details of the user representing the client, in order to 
     * @param {string} username - The username of the client
     * @param {string} roomId - The current room's Id 
     */
    setUser(username, roomId) {
        this.#username = username;
        this.#roomId = roomId;
    }

    /**
     * Send a file or image to the server.
     * @param {URI} URI - The file's URI
     * @param {string} type - "Image" or "File"
     * @throws {Error} if the posting user hasn't been set
     */
    sendFile(URI, type) {
        let image = new File([URI], URI.name, { type: URI.type, message_type: type });
        this.#sendMessage("multipart/form-data", type, image);
    }

    /**
     * Send a text message to the server.
     * @param {string} text - The text to be sent 
     * @throws {Error} if the posting user hasn't been set
     */
    sendText(text) {
        this.#sendMessage("", "Text", text);
    }

    /**
     * Display any new posted messages to the chat box.
     */
    refreshChat() {
        let url = new URL(this.#hostURL + "/chat-box/refresh");

        url.search = new URLSearchParams({
            roomId: this.#roomId,
            lastMessage: this.#getLastMessageId()
        });

        fetch(url, { method: "GET" })
            .then(res => res.json())
            .then(list => {
                if (list.length !== 0) console.log(list);
                // if no new messages nothing will happen
                for (let message of list) {
                    this.#addMessage(message);
                }
            });
    }

    /**
     * Get the id of the last received message.
     * @returns the id of the last received message or a sentinel if no received messages
     */
    #getLastMessageId() {
        if (this.#messages.length == 0) {
            return Chat.NO_MESSAGES_ID;
        } else {
            return this.#messages[this.#messages.length - 1].messageId;
        }
    }

    /**
     * Send a new message to the server.
     * @param {string} encoding - The fetch's POST encoding type (multimedia for files/images or 
     * text/simple for text) 
     * @param {string} type - One of the TEXT/IMAGE/FILE types 
     * @param {any} content - The contents of the message 
     */
    #sendMessage(encoding, type, content) {
        if (this.#username === undefined || this.#roomId === undefined) {
            throw new Error("Chat user has not been set");
        }

        const headers = {
            'enctype': encoding
        }

        const data = new FormData();
        data.append("roomId", this.#roomId);
        data.append("username", this.#username);
        data.append("messageType", type);
        data.append("content", content);

        let chatThis = this; // I love javascript I love javascript

        fetch(chatThis.#hostURL + "/chat-box/message/new", {
            method: "POST",
            headers: headers,
            body: data
        }).then(response => {
            if (!response.ok) {
                chatThis.#presenter.showGeneralError("An error ocurred while sending the message to the server");
                console.log("Error while sending message : " + response.text);
            }
        });
        console.log("Sent message : ");
        console.log(data);
    }


    /**
     * Display a message in the chat box.
     * @param {Message} message - The message to be displayed
     * @throws if the message's type is invalid
     */
    #addMessage(message) {
        // save the message
        this.#messages.push(message);

        let type = message.messageType
        message.isSelf = message.username === this.#username
        message.hostURL = this.#hostURL
        message.roomId = this.#roomId
        message.timestamp = new Date().toLocaleTimeString()
        message.fileName = message.content.split("~")[1]

        // get HTML representation
        let compiledTemplate = Handlebars.compile(Chat.TEMPLATES[type])
        let html = compiledTemplate(message)

        // add HTML to chatbox
        const container = document.createElement("div")
        container.innerHTML = html
        this.#appendToChatBox(container)
    }

    #appendToChatBox(messageContainer) {
        this.#chatboxElement.appendChild(messageContainer);
    }

}