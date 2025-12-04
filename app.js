// app.js - integra temporizador, persistência Firebase e player de áudio local em loop

const firebaseConfig = {
  apiKey: "AIzaSyAKKgxLzTl-He-pnw8OAIQKhSpHQHoegwk",
  authDomain: "respire-26736.firebaseapp.com",
  projectId: "respire-26736",
  storageBucket: "respire-26736.appspot.com",
  messagingSenderId: "35961240966",
  appId: "1:35961240966:web:01e231fcb08d13c9848007",
  measurementId: "G-E3VQL0HTT5",
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

(() => {
  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const timeToMMSS = (s) => {
    const m = Math.floor(s / 60)
      .toString()
      .padStart(2, "0");
    const sec = Math.floor(s % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${sec}`;
  };

  // ---------- Elements ----------
  const presets = $$(".preset");
  const timeDisplay = $("#time-display");
  const ring = document.querySelector(".progress-fg");
  const btnStart = $("#btn-start");
  const btnPause = $("#btn-pause");
  const btnReset = $("#btn-reset");
  const btnCancel = $("#btn-cancel");
  const chkSound = $("#chk-sound");
  const selSound = $("#sel-sound");
  const chkWake = $("#chk-wakelock");
  const btnOpenLogin = $("#btn-open-login");
  const loginModal = $("#login-modal");
  const modalClose = $("#modal-close");
  const authForm = $("#auth-form");
  const authEmail = $("#auth-email");
  const authPass = $("#auth-pass");
  const accountArea = $("#account-area");
  const btnExport = $("#btn-export");
  const btnClearData = $("#btn-clear-data");
  const tipListEl = $("#tips-list");
  const tipOfDayEl = $("#tip-of-day");
  const totalMinutesEl = $("#total-minutes");
  const sessionsCountEl = $("#sessions-count");
  const weeklyProgressEl = $("#weekly-progress");
  const sessionsListEl = $("#sessions-list");
  const yearEl = $("#year");
  const presetGroup = $("#preset-group");
  const audioPlayer = $("#audio-player");

  yearEl.textContent = new Date().getFullYear();

  // ---------- App State ----------
  let state = {
    duration: 180,
    remaining: 180,
    running: false,
    paused: false,
    tickInterval: null,
    startAt: null,
    wakeLock: null,
    currentUser: null,
  };

  let userInteractedForAudio = false;

  // ---------- Data (tips apenas local) ----------
  const defaultTips = [
    {
      id: "t1",
      cat: "iniciante",
      title: "Comece pequeno",
      text: "Sessões curtas ajudam a criar hábito. 3 minutos já contam.",
    },
    {
      id: "t2",
      cat: "postura",
      title: "Postura ereta",
      text: "Sente-se com a coluna alinhada e ombros relaxados.",
    },
    {
      id: "t3",
      cat: "respiração",
      title: "Respiração contada",
      text: "Inspire 4s, segure 2s, expire 6s para acalmar.",
    },
    {
      id: "t4",
      cat: "foco",
      title: "Foco na sensaçao",
      text: "Leve a atenção para sensações do corpo.",
    },
    {
      id: "t5",
      cat: "iniciante",
      title: "Use lembretes",
      text: "Defina um horário diário para criar consistência.",
    },
    {
      id: "t6",
      cat: "respiração",
      title: "Observe sem controlar",
      text: "Apenas observe o ar entrando e saindo.",
    },
  ];

  // ---------- Auth com Firebase ----------
  function setCurrentUser(user) {
    state.currentUser = user;
    updateAccountArea();
    refreshDashboard();
  }

  function registerOrLogin(email, password, isRegister) {
    if (isRegister) {
      // Cadastro
      return auth
        .createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
          db.collection("users").doc(userCredential.user.uid).set({
            email: email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
          setCurrentUser(userCredential.user);
          return userCredential.user;
        });
    } else {
      // Login
      return auth
        .signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
          setCurrentUser(userCredential.user);
          return userCredential.user;
        });
    }
  }

  function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    return auth
      .signInWithPopup(provider)
      .then((result) => {
        setCurrentUser(result.user);
        closeModal();
        alert("Login com Google realizado!");
      })
      .catch((error) => {
        alert(error.message || "Erro ao autenticar com Google.");
      });
  }

  function logout() {
    auth.signOut().then(() => {
      setCurrentUser(null);
      updateAccountArea();
      refreshDashboard();
    });
  }

  // ---------- UI helpers ----------
  function openModal() {
    loginModal.setAttribute("aria-hidden", "false");
    authEmail.focus();
  }
  function closeModal() {
    loginModal.setAttribute("aria-hidden", "true");
  }

  // ------------ ALTERAÇÃO DO BOTÃO SUPERIOR ------------
  function updateAccountArea() {
    const user = state.currentUser;
    accountArea.innerHTML = "";
    // ALTERAÇÃO: Atualiza também o botão do header com o id btn-open-login
    const btnHeader = $("#btn-open-login");
    if (user) {
      btnHeader.textContent = "Sair";
      btnHeader.onclick = () => {
        logout();
      };

      const el = document.createElement("div");
      el.innerHTML = `<div><strong>${escapeHtml(
        user.email || user.uid
      )}</strong></div>
        <div class="muted">Autenticado via Firebase</div>
        <div style="margin-top:0.5rem"><button id="btn-manage-logout" class="btn ghost">Sair</button></div>`;
      accountArea.appendChild(el);
      $("#btn-manage-logout").addEventListener("click", () => {
        logout();
      });
    } else {
      btnHeader.textContent = "Entrar / Cadastrar";
      btnHeader.onclick = openModal;

      const el = document.createElement("div");
      el.innerHTML = `<div class="muted">Não autenticado. Use Entrar / Cadastrar para salvar seu progresso.</div>
      <div style="margin-top:0.5rem"><button id="btn-open-login-2" class="btn">Entrar / Cadastrar</button></div>`;
      accountArea.appendChild(el);
      $("#btn-open-login-2").addEventListener("click", openModal);
    }
  }
  // ------------ FIM ALTERAÇÃO DO BOTÃO SUPERIOR ------------

  // ---------- Tips apenas local ----------
  function renderTips() {
    const tips = defaultTips;
    tipListEl.innerHTML = "";
    tips.forEach((t) => {
      const el = document.createElement("div");
      el.className = "tip";
      el.innerHTML = `<div>
          <div style="font-weight:600">${escapeHtml(t.title)}</div>
          <div class="meta">${escapeHtml(t.cat)} • ${escapeHtml(t.text)}</div>
        </div>`;
      tipListEl.appendChild(el);
    });
  }

  // ---------- Timer Logic ----------
  const RADIUS = 72;
  const CIRCUM = 2 * Math.PI * RADIUS;
  ring.style.strokeDasharray = `${CIRCUM}`;
  ring.style.strokeDashoffset = `${CIRCUM}`;

  function setPreset(seconds) {
    state.duration = seconds;
    state.remaining = seconds;
    state.startAt = null;
    state.running = false;
    state.paused = false;
    clearInterval(state.tickInterval);
    btnStart.disabled = false;
    btnPause.disabled = true;
    updateDisplay();
    // update aria-pressed
    const buttons = Array.from(presetGroup.querySelectorAll(".preset"));
    buttons.forEach((b) => {
      const s = parseInt(b.getAttribute("data-seconds"), 10);
      b.setAttribute("aria-pressed", s === seconds ? "true" : "false");
    });
  }

  function updateDisplay() {
    timeDisplay.textContent = timeToMMSS(state.remaining);
    const progress = 1 - (state.remaining / state.duration || 1);
    const offset = Math.max(0, CIRCUM - CIRCUM * progress);
    ring.style.strokeDashoffset = `${offset}`;
  }

  function tick() {
    if (!state.running) return;
    const elapsed = Math.floor((Date.now() - state.startAt) / 1000);
    state.remaining = Math.max(0, state.duration - elapsed);
    updateDisplay();
    if (state.remaining <= 0) {
      finishSession();
    }
  }

  function startTimer() {
    if (state.running) return;
    state.running = true;
    state.paused = false;
    state.startAt = Date.now() - (state.duration - state.remaining) * 1000;
    btnStart.disabled = true;
    btnPause.disabled = false;
    requestWakeLockIfNeeded();

    userInteractedForAudio = true;
    tryStartAudioIfNeeded();

    tick();
    state.tickInterval = setInterval(tick, 250);
  }

  function pauseTimer() {
    if (!state.running) return;
    clearInterval(state.tickInterval);
    state.running = false;
    state.paused = true;
    const elapsed = Math.floor((Date.now() - state.startAt) / 1000);
    state.remaining = Math.max(0, state.duration - elapsed);
    btnStart.disabled = false;
    btnPause.disabled = true;
    releaseWakeLockIfAny();
    pauseAudio();
    updateDisplay();
  }

  function resetTimer() {
    clearInterval(state.tickInterval);
    state.running = false;
    state.paused = false;
    state.remaining = state.duration;
    state.startAt = null;
    btnStart.disabled = false;
    btnPause.disabled = true;
    releaseWakeLockIfAny();
    stopAudio();
    updateDisplay();
  }

  function cancelTimer() {
    if (state.running || state.paused) {
      resetTimer();
    }
  }

  async function finishSession() {
    clearInterval(state.tickInterval);
    state.running = false;
    state.paused = false;
    state.remaining = 0;
    updateDisplay();
    btnStart.disabled = false;
    btnPause.disabled = true;
    releaseWakeLockIfAny();
    stopAudio();
    recordSession(state.duration);
    refreshDashboard();
    alert("Sessão concluída — parabéns");
  }

  // ---------- Wake Lock ----------
  async function requestWakeLockIfNeeded() {
    if (!chkWake.checked) return;
    if ("wakeLock" in navigator) {
      try {
        state.wakeLock = await navigator.wakeLock.request("screen");
        state.wakeLock.addEventListener("release", () => {
          state.wakeLock = null;
        });
      } catch (e) {
        state.wakeLock = null;
      }
    }
  }
  function releaseWakeLockIfAny() {
    if (state.wakeLock) {
      try {
        state.wakeLock.release();
      } catch (e) {}
      state.wakeLock = null;
    }
  }

  // ---------- Áudio local ----------
  function tryStartAudioIfNeeded() {
    if (!chkSound.checked) return;
    if (selSound.value !== "local-audio") return;
    playAudioLoop();
  }

  function playAudioLoop() {
    if (audioPlayer) {
      audioPlayer.currentTime = 0;
      audioPlayer.play().catch(() => {});
    }
  }

  function pauseAudio() {
    if (audioPlayer) {
      audioPlayer.pause();
    }
  }

  function stopAudio() {
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
    }
  }

  // ---------- Visibility API ----------
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.running) {
      // nada a fazer — o tick usa timestamps
    } else if (!document.hidden && state.running) {
      tick();
    }
  });

  // ---------- Sessions & Storage Firebase ----------
  function recordSession(durationSeconds) {
    const user = state.currentUser;
    if (!user) return;
    db.collection("users")
      .doc(user.uid)
      .collection("sessions")
      .add({
        durationSeconds,
        startedAt: firebase.firestore.FieldValue.serverTimestamp(),
        type: "preset",
      })
      .then(() => {
        btnExport.disabled = false;
        refreshDashboard();
      });
  }

  function getUserSessions(userId, callback) {
    db.collection("users")
      .doc(userId)
      .collection("sessions")
      .orderBy("startedAt", "desc")
      .get()
      .then((querySnapshot) => {
        const sessions = [];
        querySnapshot.forEach((doc) => sessions.push(doc.data()));
        callback(sessions);
      });
  }

  // ---------- Dashboard rendering usando Firebase ----------
  function refreshDashboard() {
    const user = state.currentUser;
    if (!user) {
      totalMinutesEl.textContent = "0";
      sessionsCountEl.textContent = "0";
      weeklyProgressEl.textContent = "0%";
      sessionsListEl.innerHTML = "";
      btnExport.disabled = true;
      return;
    }
    getUserSessions(user.uid, (sessions) => {
      const totalSeconds = sessions.reduce(
        (s, it) => s + (it.durationSeconds || 0),
        0
      );
      const totalMinutes = Math.round(totalSeconds / 60);
      totalMinutesEl.textContent = totalMinutes;
      sessionsCountEl.textContent = sessions.length;
      const weeklyGoal = 120;
      const progressPercent = Math.min(
        100,
        Math.round((totalMinutes / weeklyGoal) * 100)
      );
      weeklyProgressEl.textContent = `${progressPercent}%`;
      sessionsListEl.innerHTML = "";
      const recent = sessions.slice(0, 8);
      recent.forEach((s) => {
        const li = document.createElement("li");
        const t = s.startedAt
          ? s.startedAt.toDate
            ? s.startedAt.toDate().toLocaleString()
            : new Date(s.startedAt.seconds * 1000).toLocaleString()
          : "";
        li.innerHTML = `${timeToMMSS(
          s.durationSeconds
        )} <span class="muted">${t}</span>`;
        sessionsListEl.appendChild(li);
      });
      btnExport.disabled = sessions.length === 0;
    });
  }

  // ---------- Export CSV (adaptação para Firebase) ----------
  function exportCSV() {
    const user = state.currentUser;
    if (!user) return;
    getUserSessions(user.uid, (sessions) => {
      if (!sessions || sessions.length === 0) {
        alert("Sem sessões para exportar");
        return;
      }
      const rows = [["durationSeconds", "startedAt", "type"]];
      sessions.forEach((s) =>
        rows.push([
          s.durationSeconds,
          s.startedAt &&
            (s.startedAt.toDate
              ? s.startedAt.toDate().toISOString()
              : new Date(s.startedAt.seconds * 1000).toISOString()),
          s.type,
        ])
      );
      const csv = rows
        .map((r) =>
          r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
        )
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meditations_${user.uid}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  // ---------- Clear data (apenas local) ----------
  function clearLocalData() {
    alert(
      "Limpar sessões não funciona para Firebase! Faça pelo painel do Firebase se necessário."
    );
    // Pode manter para outras partes locais, mas não apaga sessões no Firestore.
  }

  // ---------- Utilities ----------
  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );
  }

  // ---------- Init & events ----------
  presetGroup.addEventListener("click", (e) => {
    const btn = e.target.closest(".preset");
    if (!btn) return;
    const seconds = parseInt(btn.getAttribute("data-seconds"), 10);
    if (Number.isFinite(seconds)) {
      setPreset(seconds);
    }
  });

  setPreset(180);
  btnStart.addEventListener("click", () => {
    userInteractedForAudio = true;
    startTimer();
    tryStartAudioIfNeeded();
  });
  btnPause.addEventListener("click", pauseTimer);
  btnReset.addEventListener("click", resetTimer);
  btnCancel.addEventListener("click", cancelTimer);

  btnOpenLogin.addEventListener("click", openModal);
  modalClose.addEventListener("click", closeModal);
  loginModal.addEventListener("click", (e) => {
    if (e.target === loginModal) closeModal();
  });

  // ----- AUTENTICAÇÃO -----
  // Evento para o botão de login
  $("#btn-login").addEventListener("click", () => {
    const email = authEmail.value.trim();
    const password = authPass.value;
    registerOrLogin(email, password, false) // false=lOGIN
      .then(() => {
        closeModal();
        authForm.reset();
        alert("Login efetuado com sucesso!");
      })
      .catch((e) => {
        alert(e.message || "Erro ao logar.");
      });
  });

  // Evento para o botão de cadastro
  $("#btn-register").addEventListener("click", () => {
    const email = authEmail.value.trim();
    const password = authPass.value;
    registerOrLogin(email, password, true) // true=cadastro
      .then(() => {
        closeModal();
        authForm.reset();
        alert("Cadastro efetuado com sucesso!");
      })
      .catch((e) => {
        alert(e.message || "Erro ao cadastrar.");
      });
  });

  // Evento para login com Google
  $("#btn-google").addEventListener("click", () => {
    loginWithGoogle();
  });

  // Logout
  $("#btn-logout").addEventListener &&
    $("#btn-logout").addEventListener("click", () => {
      logout();
      closeModal();
    });

  tipOfDayEl.textContent =
    (defaultTips && defaultTips[0] && defaultTips[0].text) ||
    "Feche os olhos por 30 segundos e conte suas respirações.";
  renderTips();

  btnExport.addEventListener("click", exportCSV);
  btnClearData.addEventListener("click", clearLocalData);

  auth.onAuthStateChanged((user) => {
    setCurrentUser(user || null);
    updateAccountArea();
    refreshDashboard();
  });

  document.addEventListener("keydown", (e) => {
    if (
      e.key === " " &&
      document.activeElement.tagName !== "INPUT" &&
      document.activeElement.tagName !== "TEXTAREA"
    ) {
      e.preventDefault();
      if (state.running) pauseTimer();
      else startTimer();
    }
  });

  document.body.addEventListener("keydown", function (e) {
    if (e.key === "Tab") document.body.classList.add("user-is-tabbing");
  });
})();
