document.addEventListener("DOMContentLoaded", () => {
    // Elementi DOM
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

    document.getElementById('upload-button').addEventListener('click', async () => {
        const fileInput = document.getElementById('file-input');
        const file = fileInput.files[0];
        if (!file) {
          alert('Seleziona un file prima di caricarlo.');
          return;
        }
      
        const formData = new FormData();
        formData.append('file', file);
      
        try {
          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });
          const data = await response.json();
          if (response.ok) {
            alert('File caricato con successo!');
            sendMessageWithFile(data.fileUrl); // Invia il messaggio con il file
          } else {
            alert('Errore durante il caricamento del file.');
          }
        } catch (error) {
          console.error('Errore durante il caricamento del file:', error);
        }
      });
      
      function sendMessageWithFile(fileUrl) {
        const message = {
          type: 'chat_message',
          content: '', // Puoi lasciare vuoto o aggiungere un testo opzionale
          receiverId: currentRecipientId,
          fileUrl: fileUrl,
        };
        socket.send(JSON.stringify(message));
      }

    let token = null;
    let socket = null;
    let userId = null;

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

        // Crea una connessione WebSocket (URL corretto senza /chat)
        socket = new WebSocket(`wss://localhost:3000?token=${token}`);

        // Elementi DOM della chat
        const messagesContainer = document.getElementById("messages");
        const onlineUsersList = document.getElementById("online-users");
        const messageInput = document.getElementById("message-input");
        const sendButton = document.getElementById("send-button");

        let currentRecipientId = null;

        // Gestisci la connessione WebSocket
        socket.onopen = () => {
            console.log("Connessione WebSocket stabilita");
        };

        socket.onmessage = (event) => {
            console.log("Messaggio ricevuto:", event.data); // Debug
            const data = JSON.parse(event.data);
        
            if (data.type === "online_users") {
                console.log("Utenti online ricevuti:", data.data); // Debug
                updateOnlineUsers(data.data);
            } else if (data.type === "user_online") {
                addUserOnline(data.data);
            } else if (data.type === "user_offline") {
                removeUserOffline(data.data.userId);
            } else if (data.type === "new_message") {
                addMessage(data.data);
            } else if (data.type === "messages") {
                // Mostra i messaggi globali precedenti
                data.data.forEach(message => addMessage(message));
            }
        };

        socket.onerror = (error) => {
            console.error("Errore WebSocket:", error);
        };

        socket.onclose = () => {
            console.log("Connessione WebSocket chiusa");
        };

        // Funzioni per gestire gli utenti online e i messaggi
        function updateOnlineUsers(users) {
            onlineUsersList.innerHTML = "";
            
            // Aggiungi opzione per chat globale
            const globalChat = document.createElement("li");
            globalChat.textContent = "Chat Globale";
            globalChat.classList.add("global-chat");
            globalChat.addEventListener("click", () => {
                currentRecipientId = null;
                // Rimuovi la classe "active" da tutti gli utenti
                Array.from(onlineUsersList.children).forEach((li) => li.classList.remove("active"));
                globalChat.classList.add("active");
                messagesContainer.innerHTML = ""; // Pulisci la chat
                
                // Carica messaggi globali
                fetch("https://localhost:3000/api/messages", {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                })
                .then(response => {
                    if (response.ok) return response.json();
                    throw new Error("Errore nel caricamento dei messaggi globali");
                })
                .then(messages => {
                    messagesContainer.innerHTML = "";
                    messages.forEach(message => addMessage(message));
                })
                .catch(error => {
                    console.error("Errore:", error);
                });
            });
            onlineUsersList.appendChild(globalChat);
            
            // Inizialmente seleziona la chat globale
            if (users.length > 0 && !currentRecipientId) {
                globalChat.click();
            }
            
            // Aggiungi gli utenti online (escluso l'utente corrente)
            users.forEach((user) => {
                // Non mostrare l'utente corrente nella lista
                if (user.userId === userId) return;
                
                const li = document.createElement("li");
                li.textContent = user.username;
                li.dataset.userId = user.userId; // Usa userId invece di id
                li.addEventListener("click", () => selectRecipient(user.userId));
                onlineUsersList.appendChild(li);
            });
        }

        function addUserOnline(user) {
            // Evita di aggiungere l'utente corrente
            if (user.userId === userId) return;
            
            // Evita duplicati
            if (Array.from(onlineUsersList.children).some(li => li.dataset.userId === user.userId.toString())) return;
            
            const li = document.createElement("li");
            li.textContent = user.username;
            li.dataset.userId = user.userId;
            li.addEventListener("click", () => selectRecipient(user.userId));
            onlineUsersList.appendChild(li);
        }

        function removeUserOffline(userId) {
            const userToRemove = Array.from(onlineUsersList.children).find(
                (li) => li.dataset.userId === userId.toString()
            );
            if (userToRemove) {
                onlineUsersList.removeChild(userToRemove);
            }
        }

        function addMessage(message) {
            const div = document.createElement("div");
            div.className = "message";

            // Determina se il messaggio è inviato o ricevuto
            if (message.senderId === userId) {
                div.classList.add("sent");
            } else {
                div.classList.add("received");
            }

            // Mostra il mittente e il contenuto del messaggio
            div.innerHTML = `
                <strong>${message.sender.username}:</strong> ${message.content}
                <small>${new Date(message.createdAt).toLocaleTimeString()}</small>
            `;
            messagesContainer.appendChild(div);
            messagesContainer.scrollTop = messagesContainer.scrollHeight; // Scorri verso il basso
        }
        function addMessage(message) {
            const messagesContainer = document.getElementById('messages');
            const messageElement = document.createElement('div');
            messageElement.classList.add('message');
          
            if (message.content) {
              messageElement.innerHTML += `<p>${message.content}</p>`;
            }
            if (message.fileUrl) {
              const fileExtension = message.fileUrl.split('.').pop().toLowerCase();
              if (['jpg', 'jpeg', 'png', 'gif'].includes(fileExtension)) {
                messageElement.innerHTML += `<img src="${message.fileUrl}" alt="Immagine condivisa" style="max-width: 200px;" />`;
              } else {
                messageElement.innerHTML += `<a href="${message.fileUrl}" target="_blank">Scarica file</a>`;
              }
            }
          
            messagesContainer.appendChild(messageElement);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }

        // Seleziona un destinatario
        function selectRecipient(recipientId) {
            currentRecipientId = recipientId;

            // Rimuovi la classe "active" da tutti gli utenti
            Array.from(onlineUsersList.children).forEach((li) => li.classList.remove("active"));

            // Aggiungi la classe "active" all'utente selezionato
            const selectedUser = Array.from(onlineUsersList.children).find(
                (li) => li.dataset.userId === recipientId.toString()
            );
            if (selectedUser) {
                selectedUser.classList.add("active");
            }

            messagesContainer.innerHTML = ""; // Pulisci la chat
            loadPreviousMessages(recipientId); // Carica i messaggi precedenti
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
                messagesContainer.innerHTML = ""; // Pulisci i messaggi prima di aggiungerli
                messages.forEach((message) => addMessage(message));
            } catch (error) {
                console.error("Errore durante il caricamento dei messaggi precedenti:", error);
            }
        }

        // Invia un messaggio quando si preme il pulsante "Invia"
        sendButton.addEventListener("click", () => {
            const content = messageInput.value.trim();
            if (!content) {
                alert("Scrivi un messaggio");
                return;
            }
        
            const message = {
                type: "chat_message",
                content: content,
                receiverId: currentRecipientId  // Può essere null per la chat globale
            };
            
            console.log("Invio messaggio:", message); // Debug
            socket.send(JSON.stringify(message));
            messageInput.value = ""; // Pulisci l'input
        });

        // Invia un messaggio anche premendo "Enter"
        messageInput.addEventListener("keypress", (event) => {
            if (event.key === "Enter") {
                sendButton.click();
            }
        });
    }
});