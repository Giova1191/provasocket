document.addEventListener("DOMContentLoaded", () => {
    // Elementi DOM principali
    const authScreen = document.getElementById("auth-screen");
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const chatScreen = document.getElementById("chat-screen");
    const loginEmail = document.getElementById("login-email");
    const loginPassword = document.getElementById("login-password");
    const loginButton = document.getElementById("login-button");
    const registerEmail = document.getElementById("register-email");
    const registerPassword = document.getElementById("register-password");
    const registerUsername = document.getElementById("register-username");
    const registerButton = document.getElementById("register-button");
    const switchToRegister = document.getElementById("switch-to-register");
    const switchToLogin = document.getElementById("switch-to-login");

    // Variabili globali
    let token = null;
    let socket = null;
    let userId = null;
    let currentRecipientId = null;
    let unreadMessagesCount = {}; // Contiene il numero di messaggi non letti per ogni utente

    // Variabili per la gestione delle chiamate
    let peerConnection = null;
    let localStream = null;
    let isCallActive = false;
    let isVideoCall = false;
    let isAudioEnabled = true;
    let isVideoEnabled = true;
    const startAudioCallButton = document.getElementById('start-audio-call');
    const startVideoCallButton = document.getElementById('start-video-call');
    const endCallButton = document.getElementById('end-call');
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const videoContainer = document.getElementById('video-container');
    const toggleAudioButton = document.getElementById('toggle-audio');
    const toggleVideoButton = document.getElementById('toggle-video');

    // Configurazione WebRTC
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    // Cambia tra login e registrazione
    switchToRegister.addEventListener("click", (e) => {
        e.preventDefault();
        loginForm.style.display = "none";
        registerForm.style.display = "block";
    });

    switchToLogin.addEventListener("click", (e) => {
        e.preventDefault();
        registerForm.style.display = "none";
        loginForm.style.display = "block";
    });

    // Funzione per effettuare il login
    loginButton.addEventListener("click", async () => {
        const email = loginEmail.value.trim();
        const password = loginPassword.value.trim();

        if (!email || !password) {
            alert("Inserisci email e password");
            return;
        }

        try {
            const response = await fetch("https://localhost:3000/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            if (!response.ok) {
                alert("Credenziali non valide");
                return;
            }

            const data = await response.json();
            token = data.token;
            userId = data.user.id;
            startChat();
        } catch (error) {
            console.error("Errore durante il login:", error);
            alert("Errore durante il login");
        }
    });

    // Funzione per registrarsi
    registerButton.addEventListener("click", async () => {
        const email = registerEmail.value.trim();
        const password = registerPassword.value.trim();
        const username = registerUsername.value.trim();

        if (!email || !password || !username) {
            alert("Inserisci email, password e username");
            return;
        }

        try {
            const response = await fetch("https://localhost:3000/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password, username }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                alert(errorData.message || "Errore durante la registrazione");
                return;
            }

            alert("Registrazione avvenuta con successo! Effettua il login.");
            registerForm.style.display = "none";
            loginForm.style.display = "block";
        } catch (error) {
            console.error("Errore durante la registrazione:", error);
            alert("Errore durante la registrazione");
        }
    });

    // Funzione per avviare la chat
    function startChat() {
        authScreen.style.display = "none";
        chatScreen.style.display = "flex";

        // Crea una connessione WebSocket
        socket = new WebSocket(`wss://localhost:3000?token=${token}`);

        // Inizializza i pulsanti delle chiamate
        initializeCallButtons();

        // Elementi DOM della chat
        const messagesContainer = document.getElementById("messages");
        const onlineUsersList = document.getElementById("online-users");
        const messageInput = document.getElementById("message-input");
        const sendButton = document.getElementById("send-button");
        const fileInput = document.getElementById("file-input");
        const uploadButton = document.getElementById("upload-button");

        // Gestisci la connessione WebSocket
        socket.onopen = () => {
            console.log("Connessione WebSocket stabilita");
        };

        socket.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Ricevuto messaggio:', data.type, 'da:', data.senderId, 'a:', data.recipientId);
                
                // Verifica che il messaggio di chiamata sia destinato a noi
                if (['call_offer', 'call_answer', 'ice_candidate', 'call_end', 'call_reject'].includes(data.type)) {
                    if (data.recipientId === userId || data.senderId === userId) {
                        console.log('Gestisco messaggio di chiamata:', data);
                        await handleCallMessage(data);
                    } else {
                        console.log('Ignoro messaggio di chiamata non destinato a me');
                    }
                    return;
                }
                
                switch(data.type) {
                    case 'online_users':
                        updateOnlineUsers(data.data);
                        break;
                    case 'user_online':
                        addUserOnline(data.data);
                        break;
                    case 'user_offline':
                        removeUserOffline(data.data.userId);
                        break;
                    case 'new_message':
                        addMessage(data.data);
                        break;
                }
            } catch (error) {
                console.error('Errore nella gestione del messaggio WebSocket:', error);
            }
        };

        socket.onerror = (error) => {
            console.error("Errore WebSocket:", error);
        };

        socket.onclose = () => {
            console.log("Connessione WebSocket chiusa");
        };

        // Aggiorna la lista degli utenti online
        function updateOnlineUsers(users) {
            onlineUsersList.innerHTML = "";

            // Aggiungi opzione per chat globale
            const globalChat = document.createElement("li");
            globalChat.textContent = "Chat Globale";
            globalChat.classList.add("global-chat");
            globalChat.addEventListener("click", () => {
                currentRecipientId = null;
                resetUnreadCount(null);
                Array.from(onlineUsersList.children).forEach((li) => li.classList.remove("active"));
                globalChat.classList.add("active");
                messagesContainer.innerHTML = "";
                loadPreviousMessages(null);
            });
            onlineUsersList.appendChild(globalChat);

            // Aggiungi gli utenti online (escluso l'utente corrente)
            users.forEach((user) => {
                if (user.userId === userId) return;

                const li = document.createElement("li");
                li.textContent = user.username;
                li.dataset.userId = user.userId;

                // Aggiungi un elemento per mostrare i messaggi non letti
                const unreadBadge = document.createElement("span");
                unreadBadge.classList.add("unread-badge");
                unreadBadge.style.display = "none";
                li.appendChild(unreadBadge);

                li.addEventListener("click", () => {
                    selectRecipient(user.userId);
                    resetUnreadCount(user.userId);
                });

                onlineUsersList.appendChild(li);
            });

            // Se il destinatario corrente non è più online, resetta lo stato
            if (currentRecipientId && !users.some(user => user.userId === currentRecipientId)) {
                currentRecipientId = null;
                globalChat.click();
            }
        }

        // Aggiungi un utente online
        function addUserOnline(user) {
            if (user.userId === userId) return;

            if (Array.from(onlineUsersList.children).some((li) => li.dataset.userId === user.userId.toString())) return;

            const li = document.createElement("li");
            li.textContent = user.username;
            li.dataset.userId = user.userId;

            // Aggiungi un elemento per mostrare i messaggi non letti
            const unreadBadge = document.createElement("span");
            unreadBadge.classList.add("unread-badge");
            unreadBadge.style.display = "none";
            li.appendChild(unreadBadge);

            li.addEventListener("click", () => {
                selectRecipient(user.userId);
                resetUnreadCount(user.userId);
            });

            onlineUsersList.appendChild(li);
        }

        // Rimuovi un utente offline
        function removeUserOffline(userIdToRemove) {
            const userToRemove = Array.from(onlineUsersList.children).find(
                (li) => li.dataset.userId === userIdToRemove.toString()
            );

            if (userToRemove) {
                onlineUsersList.removeChild(userToRemove);
            }
        }

        // Aggiungi un messaggio alla chat
        function addMessage(message) {
            const div = document.createElement("div");
            div.className = "message";

            if (message.senderId === userId) {
                div.classList.add("sent");
            } else {
                div.classList.add("received");

                // Aggiorna il contatore dei messaggi non letti se il mittente non è selezionato
                if (message.senderId !== currentRecipientId) {
                    updateUnreadCount(message.senderId);
                }
            }

            div.innerHTML = `
                <strong>${message.sender.username}:</strong> ${message.content || ""}
                ${message.fileUrl ? `<a href="${message.fileUrl}" target="_blank">Scarica file</a>` : ""}
                <small>${new Date(message.createdAt).toLocaleTimeString()}</small>
            `;

            messagesContainer.appendChild(div);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        // Aggiorna il contatore dei messaggi non letti
        function updateUnreadCount(userId) {
            if (!userId) return;

            unreadMessagesCount[userId] = (unreadMessagesCount[userId] || 0) + 1;

            const userLi = Array.from(onlineUsersList.children).find(
                (li) => li.dataset.userId === userId.toString()
            );

            if (userLi) {
                const unreadBadge = userLi.querySelector(".unread-badge");
                unreadBadge.textContent = unreadMessagesCount[userId];
                unreadBadge.style.display = "inline";
            }
        }

        // Resetta il contatore dei messaggi non letti
        function resetUnreadCount(userId) {
            if (!userId) return;

            unreadMessagesCount[userId] = 0;

            const userLi = Array.from(onlineUsersList.children).find(
                (li) => li.dataset.userId === userId.toString()
            );

            if (userLi) {
                const unreadBadge = userLi.querySelector(".unread-badge");
                unreadBadge.textContent = "";
                unreadBadge.style.display = "none";
            }
        }

        // Seleziona un destinatario
        function selectRecipient(recipientId) {
            console.log('Selezionato destinatario:', recipientId);
            currentRecipientId = recipientId;
            
            Array.from(onlineUsersList.children).forEach((li) => {
                if (li.dataset.userId === recipientId.toString()) {
                    li.classList.add("active");
                    // Aggiorniamo il titolo del pulsante di chiamata con il nome dell'utente
                    if (startAudioCallButton) {
                        const username = li.textContent.trim();
                        startAudioCallButton.title = `Avvia chiamata audio con ${username}`;
                        startVideoCallButton.title = `Avvia videochiamata con ${username}`;
                    }
                } else {
                    li.classList.remove("active");
                }
            });

            messagesContainer.innerHTML = "";
            loadPreviousMessages(recipientId);
            updateCallUI(); // Aggiorniamo l'UI delle chiamate quando selezioniamo un utente
        }

        // Carica i messaggi precedenti
        async function loadPreviousMessages(recipientId) {
            if (!recipientId) return;

            try {
                const response = await fetch(`https://localhost:3000/api/messages?recipientId=${recipientId}`, {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    console.error("Errore durante il caricamento dei messaggi precedenti");
                    return;
                }

                const messages = await response.json();
                messagesContainer.innerHTML = "";
                messages.forEach((message) => addMessage(message));
            } catch (error) {
                console.error("Errore durante il caricamento dei messaggi precedenti:", error);
            }
        }

        // Invia un messaggio
        sendButton.addEventListener("click", () => {
            const content = messageInput.value.trim();

            if (!content) {
                alert("Scrivi un messaggio");
                return;
            }

            const message = {
                type: "chat_message",
                content: content,
                receiverId: currentRecipientId,
            };

            socket.send(JSON.stringify(message));
            messageInput.value = "";
        });

        // Invia un messaggio premendo "Enter"
        messageInput.addEventListener("keypress", (event) => {
            if (event.key === "Enter") {
                sendButton.click();
            }
        });

        // Gestisci il caricamento dei file
        uploadButton.addEventListener("click", async () => {
            const file = fileInput.files[0];

            if (!file) {
                alert("Seleziona un file prima di caricarlo.");
                return;
            }

            const formData = new FormData();
            formData.append("file", file);

            try {
                const response = await fetch("/api/upload", {
                    method: "POST",
                    body: formData,
                });

                if (!response.ok) {
                    alert("Errore durante il caricamento del file.");
                    return;
                }

                const data = await response.json();
                alert("File caricato con successo!");
                sendMessageWithFile(data.fileUrl);
            } catch (error) {
                console.error("Errore durante il caricamento del file:", error);
            }
        });

        // Invia un messaggio con un file
        function sendMessageWithFile(fileUrl) {
            const message = {
                type: "chat_message",
                content: "",
                receiverId: currentRecipientId,
                fileUrl: fileUrl,
            };

            socket.send(JSON.stringify(message));
        }
    }

    // Funzioni per la gestione delle chiamate
    function initializeCallButtons() {
        if (startAudioCallButton) {
            startAudioCallButton.onclick = () => startCall(false);
            console.log('Pulsante chiamata audio inizializzato');
        }
        if (startVideoCallButton) {
            startVideoCallButton.onclick = () => startCall(true);
            console.log('Pulsante videochiamata inizializzato');
        }
        if (endCallButton) {
            endCallButton.onclick = endCall;
            console.log('Pulsante fine chiamata inizializzato');
        }
        if (toggleAudioButton) {
            toggleAudioButton.onclick = toggleAudio;
            console.log('Pulsante toggle audio inizializzato');
        }
        if (toggleVideoButton) {
            toggleVideoButton.onclick = toggleVideo;
            console.log('Pulsante toggle video inizializzato');
        }
    }

    async function startCall(withVideo = false) {
        try {
            console.log('=== INIZIO AVVIO CHIAMATA ===');
            console.log('Tipo chiamata:', withVideo ? 'Video' : 'Audio');
            console.log('ID utente corrente:', userId);
            console.log('Destinatario:', currentRecipientId);
            
            if (!currentRecipientId) {
                console.log('Nessun destinatario selezionato');
                alert('Seleziona un utente prima di iniziare una chiamata');
                return;
            }

            if (isCallActive) {
                console.log('Chiamata già attiva');
                alert('C\'è già una chiamata attiva');
                return;
            }

            // Troviamo il nome dell'utente chiamato
            const recipientLi = Array.from(document.querySelectorAll('#online-users li')).find(
                li => li.dataset.userId === currentRecipientId.toString()
            );
            const recipientName = recipientLi ? recipientLi.textContent.trim() : 'utente';
            
            // Mostriamo un feedback visivo che stiamo chiamando
            const callButton = withVideo ? startVideoCallButton : startAudioCallButton;
            if (callButton) {
                callButton.title = `Chiamata in corso con ${recipientName}...`;
            }

            console.log('Richiedo permessi media...');
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: withVideo
            });
            console.log('Permessi media ottenuti');

            // Se è una videochiamata, mostriamo il video locale
            if (withVideo && localVideo) {
                localVideo.srcObject = localStream;
                videoContainer.style.display = 'flex';
            }

            isVideoCall = withVideo;
            createPeerConnection();

            localStream.getTracks().forEach(track => {
                console.log('Aggiungo traccia:', track.kind);
                peerConnection.addTrack(track, localStream);
            });

            console.log('Creo offerta...');
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            // Troviamo il nome utente del chiamante
            const userLi = Array.from(document.querySelectorAll('#online-users li')).find(
                li => li.dataset.userId === userId.toString()
            );
            const senderUsername = userLi ? userLi.textContent.trim() : 'Chiamante';

            const callMessage = {
                type: 'call_offer',
                recipientId: currentRecipientId,
                senderId: userId,
                offer: offer,
                senderUsername: senderUsername,
                isVideo: withVideo
            };

            console.log('Invio offerta al destinatario:', callMessage);
            socket.send(JSON.stringify(callMessage));

            isCallActive = true;
            updateCallUI();
            console.log('=== FINE AVVIO CHIAMATA ===');

        } catch (error) {
            console.error('Errore durante l\'avvio della chiamata:', error);
            cleanupCall();
            alert('Errore durante l\'avvio della chiamata: ' + error.message);
        }
    }

    function createPeerConnection() {
        console.log('Creo connessione peer');
        peerConnection = new RTCPeerConnection(configuration);

        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                console.log('Nuovo candidato ICE trovato');
                socket.send(JSON.stringify({
                    type: 'ice_candidate',
                    recipientId: currentRecipientId,
                    senderId: userId,
                    candidate: event.candidate
                }));
            }
        };

        peerConnection.ontrack = event => {
            console.log('Ricevuta traccia remota:', event.track.kind);
            if (event.track.kind === 'video' && remoteVideo) {
                remoteVideo.srcObject = event.streams[0];
                videoContainer.style.display = 'flex';
            } else if (event.track.kind === 'audio') {
                const audio = new Audio();
                audio.srcObject = event.streams[0];
                audio.play().catch(e => console.error('Errore riproduzione audio:', e));
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('Stato connessione ICE:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'failed' || 
                peerConnection.iceConnectionState === 'closed') {
                endCall();
            }
        };
    }

    function endCall() {
        console.log('Termino la chiamata');
        cleanupCall();
        
        if (currentRecipientId) {
            socket.send(JSON.stringify({
                type: 'call_end',
                recipientId: currentRecipientId,
                senderId: userId
            }));
        }
    }

    function cleanupCall() {
        console.log('Pulisco lo stato della chiamata');
        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
                console.log('Traccia fermata:', track.kind);
            });
            localStream = null;
        }

        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
            console.log('Connessione peer chiusa');
        }

        // Pulizia video
        if (localVideo) {
            localVideo.srcObject = null;
            localVideo.style.display = 'block'; // Reset display style
        }
        if (remoteVideo) {
            remoteVideo.srcObject = null;
        }
        if (videoContainer) {
            videoContainer.style.display = 'none';
        }

        isCallActive = false;
        isVideoCall = false;
        isAudioEnabled = true;
        isVideoEnabled = true;
        updateCallUI();
    }

    function updateCallUI() {
        console.log('Aggiorno UI chiamata, stato attivo:', isCallActive);
        
        // Gestione pulsanti chiamata
        if (startAudioCallButton) {
            startAudioCallButton.style.display = isCallActive ? 'none' : 'inline-block';
            startAudioCallButton.disabled = !currentRecipientId;
            startAudioCallButton.style.opacity = currentRecipientId ? '1' : '0.5';
            if (!isCallActive) {
                startAudioCallButton.title = currentRecipientId ? 'Avvia chiamata audio' : 'Seleziona un utente per chiamare';
            }
        }
        if (startVideoCallButton) {
            startVideoCallButton.style.display = isCallActive ? 'none' : 'inline-block';
            startVideoCallButton.disabled = !currentRecipientId;
            startVideoCallButton.style.opacity = currentRecipientId ? '1' : '0.5';
            if (!isCallActive) {
                startVideoCallButton.title = currentRecipientId ? 'Avvia videochiamata' : 'Seleziona un utente per chiamare';
            }
        }
        if (endCallButton) {
            endCallButton.style.display = isCallActive ? 'inline-block' : 'none';
        }

        // Gestione pulsanti toggle
        if (toggleAudioButton) {
            toggleAudioButton.style.display = isCallActive ? 'inline-block' : 'none';
            toggleAudioButton.innerHTML = isAudioEnabled ? 
                '<i class="fas fa-microphone"></i>' : 
                '<i class="fas fa-microphone-slash"></i>';
            toggleAudioButton.title = isAudioEnabled ? 'Disattiva microfono' : 'Attiva microfono';
        }
        if (toggleVideoButton) {
            toggleVideoButton.style.display = (isCallActive && isVideoCall) ? 'inline-block' : 'none';
            toggleVideoButton.innerHTML = isVideoEnabled ? 
                '<i class="fas fa-video"></i>' : 
                '<i class="fas fa-video-slash"></i>';
            toggleVideoButton.title = isVideoEnabled ? 'Disattiva webcam' : 'Attiva webcam';
        }
    }

    function toggleAudio() {
        if (!localStream) return;
        
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            isAudioEnabled = !isAudioEnabled;
            audioTrack.enabled = isAudioEnabled;
            console.log('Audio ' + (isAudioEnabled ? 'attivato' : 'disattivato'));
            updateCallUI();
        }
    }

    function toggleVideo() {
        if (!localStream || !isVideoCall) return;
        
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            isVideoEnabled = !isVideoEnabled;
            videoTrack.enabled = isVideoEnabled;
            console.log('Video ' + (isVideoEnabled ? 'attivato' : 'disattivato'));
            
            // Aggiorna l'anteprima locale
            if (localVideo) {
                localVideo.style.display = isVideoEnabled ? 'block' : 'none';
            }
            updateCallUI();
        }
    }

    async function handleCallMessage(data) {
        try {
            console.log('=== INIZIO GESTIONE MESSAGGIO CHIAMATA ===');
            console.log('Tipo messaggio:', data.type);
            console.log('Mittente:', data.senderId);
            console.log('Destinatario:', data.recipientId);
            console.log('Dati completi:', data);
            
            // Verifica che il messaggio sia destinato a noi
            if (data.recipientId !== userId && data.senderId !== userId) {
                console.log('Messaggio non destinato a questo utente, ignoro');
                return;
            }

            switch(data.type) {
                case 'call_offer':
                    if (data.recipientId === userId) {
                        console.log('Ricevuta offerta di chiamata da:', data.senderId);
                        await handleCallOffer(data);
                    }
                    break;
                case 'call_answer':
                    if (data.recipientId === userId) {
                        console.log('Ricevuta risposta alla chiamata da:', data.senderId);
                        await handleCallAnswer(data);
                    }
                    break;
                case 'ice_candidate':
                    if (data.recipientId === userId) {
                        console.log('Ricevuto candidato ICE da:', data.senderId);
                        await handleIceCandidate(data);
                    }
                    break;
                case 'call_end':
                    if (data.recipientId === userId) {
                        console.log('Ricevuta richiesta di fine chiamata da:', data.senderId);
                        cleanupCall();
                    }
                    break;
                case 'call_reject':
                    if (data.recipientId === userId) {
                        console.log('Ricevuto rifiuto della chiamata da:', data.senderId);
                        cleanupCall();
                        alert('Chiamata rifiutata');
                    }
                    break;
            }
            console.log('=== FINE GESTIONE MESSAGGIO CHIAMATA ===');
        } catch (error) {
            console.error('Errore nella gestione del messaggio di chiamata:', error);
        }
    }

    async function handleCallOffer(data) {
        try {
            console.log('=== INIZIO GESTIONE OFFERTA ===');
            console.log('ID utente corrente:', userId);
            console.log('Dati offerta:', data);
            
            if (data.recipientId !== userId) {
                console.log('Offerta non destinata a questo utente, ignoro');
                return;
            }

            if (isCallActive) {
                console.log('Chiamata già attiva, rifiuto la nuova chiamata');
                socket.send(JSON.stringify({
                    type: 'call_reject',
                    recipientId: data.senderId,
                    senderId: userId
                }));
                return;
            }

            const callType = data.isVideo ? 'videochiamata' : 'chiamata audio';
            console.log('Mostro popup di conferma');
            const accept = confirm(`${data.senderUsername || 'Qualcuno'} vuole avviare una ${callType}. Accetti?`);

            if (!accept) {
                console.log('Utente ha rifiutato la chiamata');
                socket.send(JSON.stringify({
                    type: 'call_reject',
                    recipientId: data.senderId,
                    senderId: userId
                }));
                return;
            }

            console.log('Utente ha accettato la chiamata');
            console.log('Richiedo permessi media...');
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: data.isVideo
            });
            console.log('Permessi media ottenuti');

            // Se è una videochiamata, mostriamo il video locale
            if (data.isVideo && localVideo) {
                localVideo.srcObject = localStream;
                videoContainer.style.display = 'flex';
            }

            isVideoCall = data.isVideo;
            createPeerConnection();

            localStream.getTracks().forEach(track => {
                console.log('Aggiungo traccia alla risposta:', track.kind);
                peerConnection.addTrack(track, localStream);
            });

            console.log('Imposto descrizione remota');
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            
            console.log('Creo risposta');
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            console.log('Invio risposta al chiamante');
            socket.send(JSON.stringify({
                type: 'call_answer',
                recipientId: data.senderId,
                senderId: userId,
                answer: answer
            }));

            currentRecipientId = data.senderId;
            isCallActive = true;
            updateCallUI();
            console.log('=== FINE GESTIONE OFFERTA ===');

        } catch (error) {
            console.error('Errore nella gestione dell\'offerta:', error);
            cleanupCall();
            alert('Errore durante l\'accettazione della chiamata: ' + error.message);
        }
    }

    async function handleCallAnswer(data) {
        try {
            console.log('Gestisco risposta alla chiamata');
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                console.log('Descrizione remota impostata con successo');
            }
        } catch (error) {
            console.error('Errore nella gestione della risposta:', error);
            cleanupCall();
        }
    }

    async function handleIceCandidate(data) {
        try {
            console.log('Gestisco candidato ICE');
            if (peerConnection && data.candidate) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log('Candidato ICE aggiunto con successo');
            }
        } catch (error) {
            console.error('Errore nell\'aggiunta del candidato ICE:', error);
        }
    }
});