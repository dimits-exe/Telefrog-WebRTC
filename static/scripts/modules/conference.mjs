/**
 * A class managing the connections and streams between the conference's participants
 * on the client side.
 */
export class Conference {
    static STREAM_CONSTRAINTS = { audio: true, video: true };
    static PEER_SERVER_CONFIG = { host: "/", port: "3001" };

    #username; // useful to keep around
    #roomId;
    #myPeer;

    #socket;
    #presenter;
    #connectedPeers;

    #lastStreamId

    /**
     * Initialize the data structures before establishing connection to remote server.
     * @param {Socket} socket - A socket connected to the server
     * @param {Presenter} presenter - The proxy object for the current HTML page 
     */
    constructor(socket, presenter) {
        this.#socket = socket;
        this.#presenter = presenter;
        this.#connectedPeers = {};
    }

    /**
     * Starts a stream with the user himself, and receives the streams of all other people in the room.
     * @param {string} username - The name of the user attempting the connection 
     * @param {string} roomId - The ID of the room to be connected to
     */
    connect(username, roomId) {
        this.#username = username;
        this.#roomId = roomId;

        // must be created here and not in constructor
        this.#myPeer = new Peer(undefined, Conference.PEER_SERVER_CONFIG);

        // Could have extracted the parameters from the presenter but its clearer to 
        // explicitly ask for them in the method
        this.#myPeer.on("open", peerId => {
            console.log("Opened on peer server, sending join request to server");
            let message = {
                username: username,
                room: roomId,
                peer: peerId
            };

            this.#setUpStream(message);
        });

        // handle disconnect
        this.#socket.on("user-disconnected", id => {
            console.log("User disconnected " + id);
            this.#userDisconnected(id);
        });
    }

    /**
     * Remove the display of a disconnected user. 
     * @param {string} userId - The disconnected user's ID 
     */
    #userDisconnected(userId) {
        if (this.#connectedPeers[userId])
            this.#connectedPeers[userId].close();
    }

    /**
     * Start streaming self and configure the peer server as to receive and send video.
     * @param {any} message - A message object as defined by Docs.md
     */
    #setUpStream(message) {
        const myVideo = document.createElement("video");
        myVideo.muted = true;

        navigator.mediaDevices.getUserMedia(Conference.STREAM_CONSTRAINTS)
            .then(stream => {
                // request session from server
                this.#socket.emit("join", message);

                // receive session status from server
                this.#socket.on("join-status", (statusCode, statusMessage) => {
                    if (statusCode === 200) {
                        this.#presenter.showConnected("Connected to room " + this.#roomId);

                        // set up video streams
                        this.#addVideoStream(this.#username, myVideo, stream);

                        // set up call
                        this.#myPeer.on("call", call => {
                            // listen to incoming streams
                            call.answer(stream);

                            // respond to incoming streams
                            const video = document.createElement("video");
                            call.on("stream", userVideoStream => {
                                this.#addVideoStream(this.#username, video, userVideoStream);
                            });
                        });

                        // when other user connects
                        this.#socket.on("user-connected", (username, peer) => {
                            this.#connectToNewUser(username, peer, stream);
                        });
                    } else {
                        this.#presenter.showInputError("Cannot join room : " + statusMessage);
                    }
                });

            }).catch(err => {
                this.#presenter.showInputError("Error while accessing media devices: " + err);
            });
    }

    /**
     * Establish a new stream on the user's screen.
     * @param {string} username - The name of the user that connected
     * @param {string} peerId the connecting user's peer id
     * @param {MediaSession} stream the connecting user's stream
     */
    #connectToNewUser(username, peerId, stream) {
        console.log(`Attempt to call user ${peerId}`);
        const call = this.#myPeer.call(peerId, stream);
        const video = document.createElement("video");

        call.on("stream", userVideoStream => {
            console.log("Got stream from " + peerId);
            this.#addVideoStream(username, video, userVideoStream);
        });

        call.on("close", () => {
            video.remove();
        });

        // update connected users
        this.#connectedPeers[peerId] = call;
    }

    /**
     * Add a new video element along with its corresponding media stream to the screen.
     * @param {string} username - The name of the user that connected
     * @param {HTMLElement} video - The video element
     * @param {MediaStream} stream - The corresponding media stream
     */
    #addVideoStream(username, video, stream) {
        // avoid bug with duplicate calls because of peer server call impl
        if(stream.id !== this.#lastStreamId) {
            this.#lastStreamId = stream.id;
            this.#presenter.addVideoElement(username, video, stream);
        }
    }
}