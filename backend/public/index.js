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
            token = data.token; // Salva il token JWT
            userId = data.user.id; // Salva l'ID utente
            startChat(); // Avvia la chat
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
        authScreen.style.display = "none"; // Nascondi la schermata di login/registrazione
        chatScreen.style.display = "flex"; // Mostra la schermata della chat

        // Crea una connessione WebSocket
        socket = new WebSocket(`wss://localhost:3000?token=${token}`);

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

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === "online_users") {
                updateOnlineUsers(data.data);
            } else if (data.type === "user_online") {
                addUserOnline(data.data);
            } else if (data.type === "user_offline") {
                removeUserOffline(data.data.userId);
            } else if (data.type === "new_message") {
                addMessage(data.data);
            } else if (data.type === "messages") {
                data.data.forEach((message) => addMessage(message));
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
                resetUnreadCount(null); // Resetta il contatore per la chat globale
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
                unreadBadge.style.display = "none"; // Nascondi inizialmente
                li.appendChild(unreadBadge);

                li.addEventListener("click", () => {
                    selectRecipient(user.userId);
                    resetUnreadCount(user.userId); // Resetta il contatore quando si seleziona l'utente
                });

                onlineUsersList.appendChild(li);
            });

            // Seleziona automaticamente la chat globale
            if (!currentRecipientId) {
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
            unreadBadge.style.display = "none"; // Nascondi inizialmente
            li.appendChild(unreadBadge);

            li.addEventListener("click", () => {
                selectRecipient(user.userId);
                resetUnreadCount(user.userId); // Resetta il contatore quando si seleziona l'utente
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
                unreadBadge.style.display = "inline"; // Mostra il badge
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
                unreadBadge.style.display = "none"; // Nascondi il badge
            }
        }

        // Seleziona un destinatario
        function selectRecipient(recipientId) {
            currentRecipientId = recipientId;
            Array.from(onlineUsersList.children).forEach((li) => li.classList.remove("active"));

            const selectedUser = Array.from(onlineUsersList.children).find(
                (li) => li.dataset.userId === recipientId.toString()
            );

            if (selectedUser) {
                selectedUser.classList.add("active");
            }

            messagesContainer.innerHTML = "";
            loadPreviousMessages(recipientId);
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
                content: "", // Puoi lasciare vuoto o aggiungere un testo opzionale
                receiverId: currentRecipientId,
                fileUrl: fileUrl,
            };

            socket.send(JSON.stringify(message));
        }
    }
});