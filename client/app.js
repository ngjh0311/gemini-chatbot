/* This script is used to send a POST request to the backend API 
   which then forwards it to Google Gemini API */

import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";

let prompt = null;
let isResponseGenerating = false;
let chatHistory = []; // Store chat history in memory
let attachedImageFile = null; // currently selected image file

const chatList = document.querySelector(".chat-list");
const suggestions = document.querySelectorAll(".suggestion-list .suggestion");
const toggleThemeButton = document.getElementById("toggle-theme-button");
const deleteChatButton = document.getElementById("delete-chat-button");
const promptForm = document.getElementById("prompt-form");
const imageInput = document.getElementById("image-input");
const imagePreview = document.getElementById("image-preview");
const attachButton = document.getElementById("attach-button");

/**
 * Initialize the application
 */
function initializeApp() {
  // Set default theme
  const isLightMode = false;
  document.body.classList.toggle("light-theme", isLightMode);
  toggleThemeButton.innerText = isLightMode ? "dark_mode" : "light_mode";
  // Clear any preview state
  if (imagePreview) imagePreview.innerHTML = "";
}

// Initialize on page load
initializeApp();

/**
 * Display chat history from memory
 */
function displayChatHistory() {
  chatList.innerHTML = "";
  
  chatHistory.forEach((chat) => {
    const userPrompt = chat.userMessage;
    const rawApiResponse = chat.apiResponse?.candidates?.[0]?.content?.parts?.[0]?.text || "Error generating response";
    const parsedApiResponse = marked.parse(rawApiResponse);

    // User message (include attached image if present)
    let outgoingHtml = `
      <div class="message-content">
        <img src="images/user.svg" alt="User Avatar" class="avatar" />
        <p class="text">${userPrompt}</p>
      </div>
    `;
    if (chat.imageUrl) {
      outgoingHtml += `\n      <div class="attached-image-wrapper">\n        <img src="${chat.imageUrl}" alt="attached" class="attached-image" />\n      </div>`;
    }
    const outgoingMessageDiv = createMessageElement(outgoingHtml, "outgoing");
    chatList.appendChild(outgoingMessageDiv);

    // AI response
    let incomingHtml = `
      <div class="message-content">
        <img src="images/gemini.svg" alt="Gemini Avatar" class="avatar" />
        <p class="text"></p>
      </div>
      <span title="Copy to clipboard" class="icon material-symbols-rounded">content_copy</span>
    `;
    const incomingMessageDiv = createMessageElement(incomingHtml, "incoming");
    chatList.appendChild(incomingMessageDiv);

    const textElement = incomingMessageDiv.querySelector(".text");
    textElement.innerHTML = parsedApiResponse;
    
    // Add copy functionality
    const copyIcon = incomingMessageDiv.querySelector(".icon");
    copyIcon.addEventListener("click", () => {
      copyToClipboard(copyIcon);
    });
    
    // Highlight code blocks
    hljs.highlightAll();
    addCopyIconToCodeBlocks();
  });

  document.body.classList.toggle("hide-header", chatHistory.length > 0);
  chatList.scrollTo(0, chatList.scrollHeight);
}

/**
 * Handle form submission
 */
promptForm.addEventListener("submit", (event) => {
  event.preventDefault();
  prompt = document.getElementById("prompt").value.trim();
  handleOutgoingMessage();
});

// Handle attach button click to open file picker
if (attachButton) {
  attachButton.addEventListener("click", (e) => {
    e.preventDefault();
    imageInput.click();
  });
}

// Handle image selection and preview
if (imageInput) {
  imageInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    attachedImageFile = file;

    // create preview with X remove button
    const url = URL.createObjectURL(file);
    imagePreview.innerHTML = `
      <div class="preview-wrapper">
        <img src="${url}" alt="attached image preview" class="preview-img" />
        <button type="button" id="remove-image" class="remove-image" title="Remove image">
          <span class="icon material-symbols-rounded">close</span>
        </button>
      </div>
    `;

    const removeBtn = document.getElementById("remove-image");
    removeBtn && removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      attachedImageFile = null;
      imageInput.value = "";
      imagePreview.innerHTML = "";
    });
  });
}

/**
 * Handle the outgoing message entered by the user
 */
function handleOutgoingMessage() {
  // allow sending if there's either text prompt or an attached image
  if (( !prompt && !attachedImageFile ) || isResponseGenerating) return;

  // proceed to send the message (text or image)
  
  isResponseGenerating = true;

  // Construct outgoing HTML, including an attached image preview if present
  let attachedHtml = "";
  if (attachedImageFile) {
    const tmpUrl = URL.createObjectURL(attachedImageFile);
    attachedHtml = `\n      <div class="attached-image-wrapper">\n        <img src="${tmpUrl}" alt="attached" class="attached-image" />\n      </div>`;
  }

  let html = `
    <div class="message-content">
      <img src="images/user.svg" alt="User Avatar" class="avatar" />
      <p class="text">${prompt}</p>
    </div>
    ${attachedHtml}
  `;
  const outgoingMessageDiv = createMessageElement(html, "outgoing");
  chatList.appendChild(outgoingMessageDiv);
  promptForm.reset();

  chatList.scrollTo(0, chatList.scrollHeight);
  document.body.classList.add("hide-header");

  setTimeout(showLoadingAnimation, 500);
  processPrompt(prompt);
}

/**
 * Create a message element
 */
function createMessageElement(html, ...classes) {
  let messageDiv = document.createElement("div");
  messageDiv.classList.add("message", ...classes);
  messageDiv.innerHTML = html;
  return messageDiv;
}

/**
 * Show a loading animation
 */
function showLoadingAnimation() {
  let html = `
    <div class="message-content">
      <img src="images/gemini.svg" alt="Gemini Avatar" class="avatar" />
      <p class="text"></p>
      <div class="loading-indicator">
        <div class="loading-bar"></div>
        <div class="loading-bar"></div>
        <div class="loading-bar"></div>
      </div>
    </div>
  `;
  const loadingMessageDiv = createMessageElement(html, "incoming", "loading");
  chatList.appendChild(loadingMessageDiv);
  chatList.scrollTo(0, chatList.scrollHeight);
}

/**
 * Process the prompt by sending it to the backend
 */
function processPrompt(userPrompt) {
  // If an image is attached, send as FormData (multipart). Otherwise send JSON.
  let fetchOptions;
  if (attachedImageFile) {
    const formData = new FormData();
    formData.append("prompt", userPrompt);
    formData.append("image", attachedImageFile);
    fetchOptions = { method: "POST", body: formData };
  } else {
    fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: userPrompt })
    };
  }

  fetch("http://127.0.0.1:3000/api/gemini", fetchOptions)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      console.log('API response (raw):', data);
      // Remove loading animation
      let loadingMessage = document.querySelector(".loading");
      if (loadingMessage) loadingMessage.remove();

      // Display the response
      const rawApiResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawApiResponse) {
        throw new Error("Invalid response from API");
      }

      const parsedApiResponse = marked.parse(rawApiResponse);
      const incomingMessageDiv = handleIncomingMessage();

      // If an image was attached when sending, display the reply immediately
      // (skip typing animation) to avoid long waits in the UI.
      if (attachedImageFile) {
        const textElement = incomingMessageDiv.querySelector('.text');
        textElement.innerHTML = parsedApiResponse;
        hljs && hljs.highlightAll && hljs.highlightAll();
        addCopyIconToCodeBlocks();
        isResponseGenerating = false;
      } else {
        showTypingEffect(rawApiResponse, incomingMessageDiv, parsedApiResponse);
      }

      // Save to chat history in memory. If image was attached, save a local object URL to show it.
      if (attachedImageFile) {
        const localUrl = URL.createObjectURL(attachedImageFile);
        chatHistory.push({ userMessage: userPrompt, apiResponse: data, imageUrl: localUrl });
        // clear attached image state and preview
        attachedImageFile = null;
        if (imageInput) imageInput.value = "";
        if (imagePreview) imagePreview.innerHTML = "";
      } else {
        chatHistory.push({ userMessage: userPrompt, apiResponse: data });
      }
    })
    .catch((error) => {
      console.error(error);
      isResponseGenerating = false;

      // Remove loading animation
      let loadingMessage = document.querySelector(".loading");
      if (loadingMessage) loadingMessage.remove();

      // Display error message
      const incomingMessageDiv = handleIncomingMessage();
      const textElement = incomingMessageDiv.querySelector(".text");
      textElement.innerText = `An error occurred: ${error.message}`;
      textElement.classList.add("error");
    });
}

/**
 * Display incoming message
 */
function handleIncomingMessage() {
  let html = `
    <div class="message-content">
      <img src="images/gemini.svg" alt="Gemini Avatar" class="avatar" />
      <p class="text"></p>
    </div>
    <span title="Copy to clipboard" class="icon material-symbols-rounded">content_copy</span>
  `;
  const incomingMessageDiv = createMessageElement(html, "incoming");
  chatList.appendChild(incomingMessageDiv);

  // Event listener for the copy icon
  const copyIcon = incomingMessageDiv.querySelector(".icon");
  copyIcon.addEventListener("click", () => {
    copyToClipboard(copyIcon);
  });

  return incomingMessageDiv;
}

/**
 * Copy text to clipboard
 */
function copyToClipboard(copyIcon) {
  const messageText = copyIcon.parentElement.querySelector(".text").innerText;
  navigator.clipboard.writeText(messageText);
  copyIcon.innerText = "done";
  setTimeout(() => {
    copyIcon.innerText = "content_copy";
  }, 1000);
}

/**
 * Add copy icon to code blocks
 */
function addCopyIconToCodeBlocks() {
  const codeBlocks = document.querySelectorAll("pre");

  codeBlocks.forEach((codeBlock) => {
    // Skip if already has copy icon
    if (codeBlock.querySelector(".icon")) return;

    // Add language label
    const codeElement = codeBlock.querySelector("code");
    let language =
      [...codeElement.classList]
        .find((cls) => cls.startsWith("language-"))
        ?.replace("language-", "") || "plaintext";
    const languageLabel = document.createElement("div");
    languageLabel.innerText = language.charAt(0).toUpperCase() + language.slice(1);
    languageLabel.classList.add("code-language-label");
    codeBlock.appendChild(languageLabel);

    // Add copy icon
    const copyIcon = document.createElement("span");
    copyIcon.className = "icon material-symbols-rounded";
    copyIcon.innerText = "content_copy";
    copyIcon.title = "Copy to clipboard";
    copyIcon.addEventListener("click", () => {
      navigator.clipboard.writeText(codeElement.innerText);
      copyIcon.innerText = "done";
      setTimeout(() => {
        copyIcon.innerText = "content_copy";
      }, 1000);
    });
    codeBlock.appendChild(copyIcon);
  });
}

/**
 * Show typing effect
 */
function showTypingEffect(response, incomingMessageDiv, parsedText) {
  const textElement = incomingMessageDiv.querySelector(".text");
  const copyIcon = incomingMessageDiv.querySelector(".icon");
  copyIcon.classList.add("hide");

  const words = response.split(" ");
  const typingSpeed = 20;
  let currWordIndex = 0;

  const interval = setInterval(() => {
    textElement.innerText += (currWordIndex === 0 ? "" : " ") + words[currWordIndex++];
    
    if (currWordIndex === words.length) {
      clearInterval(interval);
      isResponseGenerating = false;
      textElement.innerHTML = parsedText;
      hljs.highlightAll();
      addCopyIconToCodeBlocks();
      copyIcon.classList.remove("hide");
    }
    
    chatList.scrollTo(0, chatList.scrollHeight);
  }, typingSpeed);
}

// Event listeners for suggestions
suggestions.forEach((suggestion) => {
  suggestion.addEventListener("click", () => {
    prompt = suggestion.querySelector(".text").innerText;
    handleOutgoingMessage();
  });
});

// Theme toggle functionality
toggleThemeButton.addEventListener("click", () => {
  const isLightMode = document.body.classList.toggle("light-theme");
  toggleThemeButton.innerText = isLightMode ? "dark_mode" : "light_mode";
});

// Delete chat history functionality
deleteChatButton.addEventListener("click", () => {
  if (confirm("Are you sure you want to delete the chat history?")) {
    chatHistory = [];
    chatList.innerHTML = "";
    document.body.classList.remove("hide-header");
    prompt = null;
    isResponseGenerating = false;
    // clear any attached image state
    attachedImageFile = null;
    if (imageInput) imageInput.value = "";
    if (imagePreview) imagePreview.innerHTML = "";
  }
});