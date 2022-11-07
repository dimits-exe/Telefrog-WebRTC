// Configurations
const iceServer = {
    "iceServers":[
        {"url": "stun.stun.services.mozilla.com"},
        {"url": "stun.stun.I.google.com:19302"}
    ]
};
const streamConstraints = {audio: true, video: true};

const socket = io("http://localhost"); // change this later lmao

const connectedPeers = {}

// Procedures
function joinRoom(message) {
    let myPeer = new Peer(undefined, {
        host: "/",
        port: "3001"
    })

    myPeer.on("open", id => {
        socket.emit("join", message)
    })

    socket.on("user-connected", userId => {
        console.log("User connected: " + userId)
    })
}


function connectVideo(videoGrid, video){
    socket.on("joined", () => {
        navigator.mediaDevices.getUserMedia(streamConstraints)
        .then(stream => {
            addVideoStream(videoGrid, video, stream);

            // set up call
            myPeer.on("call", call => {
                // listen to incoming streams
                call.answer(stream);

                // respond to incoming streams
                const video = document.createElement("video");
                call.on("stream", userVideoStream => {
                    addVideoStream(videoGrid, video, userVideoStream);
                })
            });

            socket.on("user-connected", userId => {
                connectToNewUser(userId, stream);
            });

        }).catch(err => {
            console.log("Error while accessing media devices" + err);
        });
    });
}


function addVideoStream(videoGrid, video, stream) {
    video.srcObject = stream;
    video.addEventListener("loadedmetadata", () => {
        video.play();
    })
    videoGrid.append(video);
}


function connectToNewUser(userId, stream){
    const call = myPeer.call(userId, stream);
    const video = document.createElement("video");

    call.on("stream", userVideoStream => {
        addVideoStream(userVideoStream);
    });

    call.on("close", () => {
        video.remove();
    });

    // update connected users
    connectedPeers[userId] = call;
}

window.onload = function(){
    const usernameInput = document.getElementById("username_input")
    const roomIdInput = document.getElementById("room_input")
    const joinRoomButton = document.getElementById("join_room_button")
    const createRoomButton = document.getElementById("create_room_button")
    
    const videoGrid = document.getElementById("videoStreams");
    const myVideo = document.createElement("video");
    myVideo.muted = true;

    joinRoomButton.onclick = () => {
        let username = usernameInput.value;
        let roomId = roomIdInput.value;
        let request = {username: username, roomId: roomId};
        // send to socket
        joinRoom(request);

        //begin streaming
        connectVideo(videoGrid, myVideo);
    };
    
    createRoomButton.onclick = () => {
        // send to socket
        socket.emit("create");

        // display
        socket.on("created", roomId=>{
            let roomInput = document.getElementById("room_input");
            roomInput.textContent = roomId;
        })        
    };

    socket.on("user-disconnected", id => {
        console.log("User disconnected " + id);
        
        if(peers[userId]){
            peers[userId].close();
        }
    });
    
}


