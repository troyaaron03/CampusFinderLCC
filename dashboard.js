import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCDuxFyTm3pYIsrO5i5ivTKZyM4SZYnpqM",
  authDomain: "campus-navigation-system-4292f.firebaseapp.com",
  projectId: "campus-navigation-system-4292f",
  storageBucket: "campus-navigation-system-4292f.firebasestorage.app",
  messagingSenderId: "1007485437799",
  appId: "1:1007485437799:web:d157f9c9ac7ff46d2591c2",
  measurementId: "G-RT9C1JGB58"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);
let currentUser = null;
let campusRooms = [];
let currentPosition = null;

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function roomCoordinates(room) {
  if (room.latitude === null || room.latitude === undefined || room.latitude === "" ||
      room.longitude === null || room.longitude === undefined || room.longitude === "") {
    return null;
  }
  const lat = Number(room.latitude);
  const lng = Number(room.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}

function roomTitle(room) {
  const number = String(room.roomNumber || "").trim();
  if (!number) return room.name || "Campus space";
  return /^room\b/i.test(number) ? number : `Room ${number}`;
}

function distanceInMeters(from, to) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latDelta = radians(to.lat - from.lat);
  const lngDelta = radians(to.lng - from.lng);
  const value = Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(lngDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function directionsUrl(destination, origin = null) {
  if (destination) {
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
    if (origin) url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
    return url.href;
  }
  return "";
}

function openSection(sectionId) {
  document.querySelectorAll(".section-tab").forEach((button) => {
    const active = button.dataset.target === sectionId;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  document.querySelectorAll(".dashboard-section").forEach((section) => {
    section.classList.toggle("active", section.id === sectionId);
  });
}

document.querySelectorAll(".section-tab").forEach((button) => {
  button.addEventListener("click", () => openSection(button.dataset.target));
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "index.html";
    return;
  }
  currentUser = user;
  $("userEmail").textContent = user.email || "";
  await loadCampusData();
});

$("logout").addEventListener("click", async () => {
  try {
    await signOut(auth);
    location.href = "index.html";
  } catch (error) {
    console.error("Sign out failed:", error);
    window.alert(`Could not sign out: ${error.message}`);
  }
});

async function loadCampusData() {
  const results = await Promise.allSettled([
    getDocs(collection(db, "faculties")),
    getDocs(collection(db, "rooms")),
    getDocs(collection(db, "qrCodes"))
  ]);

  const [facultiesResult, roomsResult, qrResult] = results;
  if (facultiesResult.status === "fulfilled") {
    renderFaculties(facultiesResult.value);
  } else {
    renderLoadError("facultyList", "Could not load faculties", facultiesResult.reason);
  }
  if (roomsResult.status === "fulfilled") {
    campusRooms = roomsResult.value.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderRooms();
  } else {
    renderLoadError("roomList", "Could not load rooms", roomsResult.reason);
    renderLoadError("mapList", "Could not load campus map", roomsResult.reason);
  }
  if (qrResult.status === "fulfilled") {
    renderQrGuides(qrResult.value);
  } else {
    renderLoadError("qrCodeList", "Could not load QR guides", qrResult.reason);
  }
}

function renderLoadError(elementId, message, error) {
  console.error(`${message}:`, error);
  $(elementId).innerHTML = `<p class="error-state">${esc(message)}. Please try again later.</p>`;
}

function renderFaculties(snapshot) {
  const list = $("facultyList");
  if (snapshot.empty) {
    list.innerHTML = '<p class="empty-state">No faculty information has been added yet.</p>';
    return;
  }
  list.innerHTML = snapshot.docs.map((item) => {
    const data = item.data();
    const image = safeHttpUrl(data.image) || (String(data.image || "").startsWith("data:image/") ? data.image : "");
    return `<article class="card">
      ${image ? `<img class="card-image" src="${esc(image)}" alt="">` : '<div class="card-art" aria-hidden="true">⌂</div>'}
      <div class="card-content"><span class="card-kicker">FACULTY</span><h3>${esc(data.name || "Faculty")}</h3>
      <p>${esc(data.description || "Campus faculty information.")}</p>
      <dl class="detail-list">${data.location ? `<div><dt>Location</dt><dd>${esc(data.location)}</dd></div>` : ""}
      ${data.contact ? `<div><dt>Contact</dt><dd>${esc(data.contact)}</dd></div>` : ""}
      ${data.hours ? `<div><dt>Office hours</dt><dd>${esc(data.hours)}</dd></div>` : ""}</dl></div>
    </article>`;
  }).join("");
}

function renderRooms() {
  const sortedRooms = [...campusRooms].sort((a, b) => {
    if (!currentPosition) return String(a.roomNumber || "").localeCompare(String(b.roomNumber || ""));
    const aCoords = roomCoordinates(a);
    const bCoords = roomCoordinates(b);
    if (!aCoords) return 1;
    if (!bCoords) return -1;
    return distanceInMeters(currentPosition, aCoords) - distanceInMeters(currentPosition, bCoords);
  });
  const roomMarkup = (room, showDistance) => {
    const coords = roomCoordinates(room);
    const image = safeHttpUrl(room.mapUrl) || (String(room.mapUrl || "").startsWith("data:image/") ? room.mapUrl : "");
    const distance = currentPosition && coords ? distanceInMeters(currentPosition, coords) : null;
    const direction = coords ? directionsUrl(coords, currentPosition) : safeHttpUrl(room.mapLink);
    return `<article class="card">
      ${image ? `<img class="card-image" src="${esc(image)}" alt="Floor plan for room ${esc(room.roomNumber || "")}">` : '<div class="card-art campus-art" role="img" aria-label="La Concepcion College campus"></div>'}
      <div class="card-content"><span class="card-kicker">${esc(room.building || "CAMPUS")} ${room.floor ? `· ${esc(room.floor)}` : ""}</span>
      <h3>${esc(roomTitle(room))}</h3>
      <p>${esc(room.description || room.roomType || "Campus room")}</p>
      ${showDistance && distance !== null ? `<p class="distance-label">${distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`} from you</p>` : ""}
      ${direction ? `<a class="text-link" href="${esc(direction)}" target="_blank" rel="noopener noreferrer">${currentPosition && coords ? "Get directions" : "View location"} <span aria-hidden="true">↗</span></a>` : (coords ? "" : '<p class="muted-note">Location coordinates not added yet.</p>')}
      </div>
    </article>`;
  };

  $("roomList").innerHTML = sortedRooms.length
    ? sortedRooms.map((room) => roomMarkup(room, true)).join("")
    : '<p class="empty-state">No rooms have been added yet.</p>';
  const mappedRooms = sortedRooms.filter((room) => roomCoordinates(room) || safeHttpUrl(room.mapLink));
  $("mapList").innerHTML = mappedRooms.length
    ? mappedRooms.map((room) => roomMarkup(room, true)).join("")
    : '<p class="empty-state">No mapped rooms yet. Campus administrators can add room coordinates.</p>';
}

function renderQrGuides(snapshot) {
  const list = $("qrCodeList");
  if (snapshot.empty) {
    list.innerHTML = '<p class="empty-state">No QR guides have been added yet.</p>';
    return;
  }
  list.innerHTML = snapshot.docs.map((item) => {
    const data = item.data();
    const target = safeHttpUrl(data.targetUrl || data.pdfLink);
    const oldImage = String(data.image || "").startsWith("data:image/") ? data.image : safeHttpUrl(data.image);
    const qrMarkup = target && window.QRCode
      ? `<div class="qr-image" id="qr-${esc(item.id)}" data-qr-target="${esc(target)}" aria-label="QR code for ${esc(data.name || "campus guide")}"></div>`
      : oldImage ? `<img class="qr-image" src="${esc(oldImage)}" alt="QR code for ${esc(data.name || "campus guide")}">` : '<div class="qr-unavailable">QR preview unavailable</div>';
    return `<article class="qr-card"><div class="qr-card-image">${qrMarkup}</div><div class="card-content">
      <span class="card-kicker">CAMPUS GUIDE</span><h3>${esc(data.name || "Campus guide")}</h3>
      ${target ? `<a class="text-link" href="${esc(target)}" target="_blank" rel="noopener noreferrer">Open destination <span aria-hidden="true">↗</span></a>` : '<p class="muted-note">This guide does not have a valid web destination.</p>'}
      </div></article>`;
  }).join("");
  if (window.QRCode) {
    list.querySelectorAll("[data-qr-target]").forEach((container) => {
      new window.QRCode(container, {
        text: container.dataset.qrTarget,
        width: 156,
        height: 156,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.M
      });
    });
  }
}

$("locateMe").addEventListener("click", () => {
  const message = $("locationMessage");
  if (!navigator.geolocation) {
    message.textContent = "Location is not available in this browser. Try a recent browser on HTTPS or localhost.";
    return;
  }
  const button = $("locateMe");
  button.disabled = true;
  message.textContent = "Requesting your location…";
  navigator.geolocation.getCurrentPosition((position) => {
    currentPosition = { lat: position.coords.latitude, lng: position.coords.longitude };
    const accuracy = Math.round(position.coords.accuracy);
    message.textContent = `Location ready (about ${accuracy} m accuracy). Your coordinates are kept on this device.`;
    $("locationSummary").hidden = false;
    $("locationSummary").innerHTML = `<span class="location-dot"></span><span>Current position</span><strong>${currentPosition.lat.toFixed(5)}, ${currentPosition.lng.toFixed(5)}</strong><span class="muted-note">Not saved to your account</span>`;
    renderRooms();
    button.disabled = false;
  }, (error) => {
    const messages = {
      1: "Location permission was denied. Allow access in your browser settings to see nearby rooms.",
      2: "Your location could not be determined. Check your device location settings and try again.",
      3: "The location request timed out. Please try again."
    };
    message.textContent = messages[error.code] || "Could not get your location. Please try again.";
    button.disabled = false;
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
});

$("feedbackForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const feedbackMessage = $("feedbackMessage");
  const submitButton = $("submitFeedback");
  if (!currentUser) {
    feedbackMessage.textContent = "Please wait for your account to load.";
    return;
  }
  const rating = Number($("rating").value);
  const comment = $("comment").value.trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    feedbackMessage.textContent = "Please choose a rating from 1 to 5.";
    return;
  }
  submitButton.disabled = true;
  feedbackMessage.textContent = "Sending feedback…";
  try {
    await addDoc(collection(db, "feedback"), {
      rating,
      comment,
      userId: currentUser.uid,
      createdAt: serverTimestamp()
    });
    $("feedbackForm").reset();
    feedbackMessage.textContent = "Thank you — your feedback has been sent.";
  } catch (error) {
    console.error("Feedback submission failed:", error);
    feedbackMessage.textContent = "Could not send feedback. Please try again.";
  } finally {
    submitButton.disabled = false;
  }
});
