// ==============================================================================
// CFM Quote Tool - Firebase UI Controller
// ==============================================================================

(function() {
  let searchDebounceTimeout = null;
  let activeTab = 'signin'; // 'signin' or 'signup'

  // Toast Notification
  function showToast(message, type = 'info') {
    let t = document.getElementById('toastNotice');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toastNotice';
      t.className = 'toast-notice';
      document.body.appendChild(t);
    }
    t.className = 'toast-notice' + (type === 'error' ? ' toast-error' : (type === 'success' ? ' toast-success' : ''));
    t.innerText = message;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
      t.classList.remove('show');
    }, 3500);
  }

  // Update Top Auth Bar & Banner
  function refreshAuthUI() {
    const isConfigured = window.CFM_FIREBASE && window.CFM_FIREBASE.isConfigured();
    const user = window.CFM_FIREBASE ? window.CFM_FIREBASE.getCurrentUser() : null;

    const authContainer = document.getElementById('firebaseAuthStatus');
    if (!authContainer) return;

    if (!isConfigured) {
      authContainer.innerHTML = `
        <span class="auth-status-pill" title="Firebase database not connected yet">
          <span class="auth-status-dot"></span> Offline Mode
        </span>
        <button type="button" class="btn-sm btn-primary" onclick="openSettingsModal()">⚙ Connect Firebase</button>
      `;
    } else if (!user) {
      authContainer.innerHTML = `
        <span class="auth-status-pill connected" title="Connected to Firebase">
          <span class="auth-status-dot active"></span> Firebase Ready
        </span>
        <button type="button" class="btn-sm btn-primary" onclick="openAuthModal('signin')">Log In / Sign Up</button>
        <button type="button" class="btn-sm" onclick="openSettingsModal()" title="Firebase Settings">⚙</button>
      `;
      const fillBtn = document.getElementById('btnFillMyInfo');
      if (fillBtn) fillBtn.style.display = 'none';
    } else {
      const profile = window.CFM_FIREBASE ? window.CFM_FIREBASE.getUserProfile(user) : { name: '', email: user.email };
      const displayLabel = profile.name ? `${profile.name} (${user.email})` : user.email;
      authContainer.innerHTML = `
        <span class="auth-status-pill connected" title="Logged in as ${escapeHtml(displayLabel)}">
          <span class="auth-status-dot active"></span> 👤 ${escapeHtml(displayLabel)}
        </span>
        <button type="button" class="btn-sm" onclick="handleSignOut()">Sign Out</button>
        <button type="button" class="btn-sm" onclick="openSettingsModal()" title="Firebase Settings">⚙</button>
      `;
      const fillBtn = document.getElementById('btnFillMyInfo');
      if (fillBtn) fillBtn.style.display = 'inline-block';
      if (typeof window.applyUserToQuotedBy === 'function') {
        window.applyUserToQuotedBy(false);
      }
    }

    refreshActiveQuoteBanner();
  }

  function refreshActiveQuoteBanner() {
    const banner = document.getElementById('quoteStatusBanner');
    const activeId = window.CFM_FIREBASE ? window.CFM_FIREBASE.getActiveQuoteId() : null;
    if (!banner) return;

    if (activeId) {
      const qNum = document.getElementById('quoteNumRef')?.value || 'Active';
      const cust = document.getElementById('customerSearch')?.value || 'Unnamed';
      banner.innerHTML = `
        <div>
          <span>✏ <strong>Editing Cloud Quote #${escapeHtml(qNum)}</strong> (${escapeHtml(cust)})</span>
          <span style="font-size:12px; margin-left: 8px; color: var(--muted);">(Changes will update this saved quote)</span>
        </div>
        <div>
          <button type="button" class="btn-sm" onclick="CFM_FIREBASE.startNewQuote()">+ Start New Quote</button>
        </div>
      `;
      banner.classList.add('show');
    } else {
      banner.classList.remove('show');
    }
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // --- Modal Management ---
  function openAuthModal(tab = 'signin') {
    activeTab = tab;
    const modal = document.getElementById('authModal');
    const alert = document.getElementById('authAlert');
    alert.className = 'form-alert';
    alert.innerText = '';
    const fn = document.getElementById('authFullName');
    if (fn) fn.value = '';
    setAuthTab(tab);
    modal.classList.add('show');
    if (tab === 'signup' && fn) {
      fn.focus();
    } else {
      document.getElementById('authEmail')?.focus();
    }
  }

  function closeAuthModal() {
    document.getElementById('authModal')?.classList.remove('show');
  }

  function setAuthTab(tab) {
    activeTab = tab;
    const signinTab = document.getElementById('tabSignIn');
    const signupTab = document.getElementById('tabSignUp');
    const submitBtn = document.getElementById('authSubmitBtn');
    const helpText = document.getElementById('authHelpText');
    const fnGroup = document.getElementById('fullNameGroup');

    if (tab === 'signin') {
      signinTab?.classList.add('active');
      signupTab?.classList.remove('active');
      if (fnGroup) fnGroup.style.display = 'none';
      if (submitBtn) submitBtn.innerText = 'Log In';
      if (helpText) helpText.innerText = 'Sign in with Firebase Authentication to access and edit your saved quotes across devices.';
    } else {
      signinTab?.classList.remove('active');
      signupTab?.classList.add('active');
      if (fnGroup) fnGroup.style.display = 'block';
      if (submitBtn) submitBtn.innerText = 'Create Account';
      if (helpText) helpText.innerText = 'Create a secure Firebase account to save quotes and manage your quote history.';
    }
  }

  async function handleAuthSubmit(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const alert = document.getElementById('authAlert');
    const submitBtn = document.getElementById('authSubmitBtn');

    if (!email || !password) {
      alert.className = 'form-alert error';
      alert.innerText = 'Please enter both email and password.';
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.innerText = 'Processing...';

      if (activeTab === 'signin') {
        await CFM_FIREBASE.signIn(email, password);
        showToast('Signed in successfully!', 'success');
        closeAuthModal();
      } else {
        const fullName = (document.getElementById('authFullName')?.value || '').trim();
        await CFM_FIREBASE.signUp(email, password, fullName);
        showToast('Account created! You are now logged in.', 'success');
        closeAuthModal();
      }
      refreshAuthUI();
      if (typeof window.applyUserToQuotedBy === 'function') {
        window.applyUserToQuotedBy(true);
      }
    } catch (err) {
      alert.className = 'form-alert error';
      alert.innerText = err.message || 'Authentication failed. Please verify credentials.';
    } finally {
      submitBtn.disabled = false;
      setAuthTab(activeTab);
    }
  }

  async function handleSignOut() {
    if (confirm('Are you sure you want to sign out?')) {
      try {
        await CFM_FIREBASE.signOut();
        showToast('Signed out successfully.');
        refreshAuthUI();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  }

  // --- Settings Modal ---
  function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    const config = CFM_FIREBASE.getConfig();
    const snippetEl = document.getElementById('settingsSnippet');
    if (snippetEl) snippetEl.value = '';

    document.getElementById('settingsProjectId').value = config.projectId || '';
    document.getElementById('settingsApiKey').value = config.apiKey || '';
    document.getElementById('settingsAuthDomain').value = config.authDomain || '';
    document.getElementById('settingsAppId').value = config.appId || '';

    const alert = document.getElementById('settingsAlert');
    alert.className = 'form-alert';
    alert.innerText = '';
    modal.classList.add('show');
  }

  function closeSettingsModal() {
    document.getElementById('settingsModal')?.classList.remove('show');
  }

  function onSettingsSnippetInput() {
    const raw = document.getElementById('settingsSnippet')?.value || '';
    const parsed = CFM_FIREBASE.parseConfigSnippet(raw);
    if (!parsed) return;

    if (parsed.projectId) document.getElementById('settingsProjectId').value = parsed.projectId;
    if (parsed.apiKey) document.getElementById('settingsApiKey').value = parsed.apiKey;
    if (parsed.authDomain) document.getElementById('settingsAuthDomain').value = parsed.authDomain;
    if (parsed.appId) document.getElementById('settingsAppId').value = parsed.appId;
  }

  function handleSaveSettings(e) {
    if (e) e.preventDefault();
    const snippetRaw = document.getElementById('settingsSnippet')?.value || '';
    const parsed = CFM_FIREBASE.parseConfigSnippet(snippetRaw) || {};

    const projectId = (document.getElementById('settingsProjectId').value || parsed.projectId || '').trim();
    const apiKey = (document.getElementById('settingsApiKey').value || parsed.apiKey || '').trim();
    const authDomain = (document.getElementById('settingsAuthDomain').value || parsed.authDomain || '').trim();
    const appId = (document.getElementById('settingsAppId').value || parsed.appId || '').trim();
    const alert = document.getElementById('settingsAlert');

    if (!projectId || !apiKey) {
      alert.className = 'form-alert error';
      alert.innerText = 'Please provide at least your Firebase Project ID and Web API Key (or paste your firebaseConfig snippet).';
      return;
    }

    try {
      CFM_FIREBASE.updateConfig({
        projectId,
        apiKey,
        authDomain: authDomain || `${projectId}.firebaseapp.com`,
        storageBucket: parsed.storageBucket || `${projectId}.appspot.com`,
        messagingSenderId: parsed.messagingSenderId || '',
        appId
      });
      showToast('Firebase settings saved and initialized!', 'success');
      closeSettingsModal();
      refreshAuthUI();
    } catch (err) {
      alert.className = 'form-alert error';
      alert.innerText = 'Failed to initialize Firebase: ' + err.message;
    }
  }

  function handleClearSettings() {
    if (confirm('Clear Firebase configuration and disconnect?')) {
      CFM_FIREBASE.clearConfig();
      document.getElementById('settingsProjectId').value = '';
      document.getElementById('settingsApiKey').value = '';
      document.getElementById('settingsAuthDomain').value = '';
      document.getElementById('settingsAppId').value = '';
      const snippetEl = document.getElementById('settingsSnippet');
      if (snippetEl) snippetEl.value = '';
      showToast('Firebase configuration cleared.');
      closeSettingsModal();
      refreshAuthUI();
    }
  }

  // --- Save Quote Action ---
  async function handleSaveQuote() {
    if (!CFM_FIREBASE.isConfigured()) {
      showToast('Please connect Firebase first to save quotes.', 'error');
      openSettingsModal();
      return;
    }

    const user = CFM_FIREBASE.getCurrentUser();
    if (!user) {
      showToast('Please log in to save quotes to your account.', 'error');
      openAuthModal('signin');
      return;
    }

    const saveBtn = document.getElementById('saveQuoteBtn');
    const oldText = saveBtn ? saveBtn.innerHTML : '💾 Save Quote';

    try {
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '⏳ Saving...';
      }

      const res = await CFM_FIREBASE.saveQuote();
      if (res.action === 'created') {
        showToast(`Quote #${res.quote.quote_number} saved to Cloud Firestore!`, 'success');
      } else {
        showToast(`Quote #${res.quote.quote_number} updated successfully!`, 'success');
      }
      refreshActiveQuoteBanner();
    } catch (err) {
      showToast('Error saving quote: ' + (err.message || err), 'error');
      console.error('Save quote error:', err);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = oldText;
      }
    }
  }

  // --- Quotes Modal ---
  async function openQuotesModal() {
    if (!CFM_FIREBASE.isConfigured()) {
      showToast('Please connect Firebase first to view saved quotes.', 'error');
      openSettingsModal();
      return;
    }

    const user = CFM_FIREBASE.getCurrentUser();
    if (!user) {
      showToast('Please log in to view your quotes.', 'error');
      openAuthModal('signin');
      return;
    }

    const modal = document.getElementById('quotesModal');
    modal.classList.add('show');
    document.getElementById('quotesSearchInput').value = '';
    await loadQuotesList();
  }

  function closeQuotesModal() {
    document.getElementById('quotesModal')?.classList.remove('show');
  }

  async function loadQuotesList(searchTerm = '') {
    const listBody = document.getElementById('quotesListBody');
    if (!listBody) return;

    listBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--muted);">Loading your quotes...</td></tr>';

    try {
      const quotes = await CFM_FIREBASE.listQuotes(searchTerm);

      if (!quotes || quotes.length === 0) {
        listBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--muted); font-size:14px;">
          ${searchTerm ? 'No quotes matched your search.' : 'You have no saved quotes yet. Click "Save Quote" on any quote to store it here.'}
        </td></tr>`;
        return;
      }

      listBody.innerHTML = quotes.map(q => {
        const dateStr = q.quote_date || '—';
        const updatedStr = q.updated_at ? new Date(q.updated_at).toLocaleDateString() : '—';
        const formattedTotal = '$' + (Number(q.total) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const custDisplay = q.customer_name ? escapeHtml(q.customer_name) : '<em style="color:var(--muted)">Unnamed</em>';
        const acctDisplay = q.account_number ? `<span style="color:var(--muted); font-size:11px;">(${escapeHtml(q.account_number)})</span>` : '';

        return `
          <tr>
            <td><strong>#${escapeHtml(String(q.quote_number))}</strong></td>
            <td>${custDisplay} ${acctDisplay}</td>
            <td>${escapeHtml(dateStr)}</td>
            <td style="font-weight:700; color:var(--navy);">${formattedTotal}</td>
            <td style="font-size:12px; color:var(--muted);">${updatedStr}</td>
            <td>
              <div class="quotes-actions-cell">
                <button type="button" class="btn-sm btn-primary" onclick="handleLoadQuote('${escapeHtml(q.id)}')" title="Load & Edit">Edit</button>
                <button type="button" class="btn-sm" onclick="handleDuplicateQuote('${escapeHtml(q.id)}')" title="Duplicate as new quote">Duplicate</button>
                <button type="button" class="btn-sm btn-danger" onclick="handleDeleteQuote('${escapeHtml(q.id)}', '${escapeHtml(String(q.quote_number))}')" title="Delete Quote">✕</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      listBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#dc2626;">Error loading quotes: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function onQuotesSearchInput() {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
      const q = document.getElementById('quotesSearchInput')?.value || '';
      loadQuotesList(q);
    }, 200);
  }

  async function handleLoadQuote(id) {
    try {
      showToast('Loading quote...', 'info');
      await CFM_FIREBASE.loadQuote(id);
      closeQuotesModal();
      refreshActiveQuoteBanner();
      showToast('Quote loaded into editor.', 'success');
    } catch (err) {
      showToast('Failed to load quote: ' + err.message, 'error');
    }
  }

  async function handleDuplicateQuote(id) {
    try {
      showToast('Duplicating quote...', 'info');
      await CFM_FIREBASE.loadQuote(id);
      // Detach from existing saved ID so it saves as a brand new quote
      CFM_FIREBASE.setActiveQuoteId(null);
      // Give it a fresh quote number
      if (typeof window.setQuote === 'function') {
        window.setQuote(true);
      }
      closeQuotesModal();
      refreshActiveQuoteBanner();
      showToast('Duplicated! This is now a new draft quote with a fresh quote number.', 'success');
    } catch (err) {
      showToast('Failed to duplicate: ' + err.message, 'error');
    }
  }

  async function handleDeleteQuote(id, quoteNum) {
    if (!confirm(`Are you sure you want to permanently delete Quote #${quoteNum}?`)) return;
    try {
      await CFM_FIREBASE.deleteQuote(id);
      showToast(`Quote #${quoteNum} deleted.`, 'success');
      const q = document.getElementById('quotesSearchInput')?.value || '';
      loadQuotesList(q);
      refreshActiveQuoteBanner();
    } catch (err) {
      showToast('Failed to delete quote: ' + err.message, 'error');
    }
  }

  // --- NetSuite Customer Sync Modal ---
  let pendingCustomerSyncPreview = null;

  async function openCustomerSyncModal() {
    if (!CFM_FIREBASE.isConfigured()) {
      showToast('Please connect Firebase first to sync customers.', 'error');
      openSettingsModal();
      return;
    }

    const user = CFM_FIREBASE.getCurrentUser();
    if (!user) {
      showToast('Please log in to sync customer records to Cloud Firestore.', 'error');
      openAuthModal('signin');
      return;
    }

    pendingCustomerSyncPreview = null;
    const fileInput = document.getElementById('customerCsvInput');
    if (fileInput) fileInput.value = '';
    const previewArea = document.getElementById('customerSyncPreviewArea');
    if (previewArea) previewArea.style.display = 'none';
    const confirmBtn = document.getElementById('confirmCustomerSyncBtn');
    if (confirmBtn) confirmBtn.disabled = true;
    const alert = document.getElementById('customerSyncAlert');
    if (alert) {
      alert.className = 'form-alert';
      alert.innerText = '';
    }

    const statusLine = document.getElementById('customerSyncStatusLine');
    const totalNow = (typeof CUSTOMERS !== 'undefined' && Array.isArray(CUSTOMERS)) ? CUSTOMERS.length : 0;
    const meta = CFM_FIREBASE.getCustomerSyncMeta ? CFM_FIREBASE.getCustomerSyncMeta() : null;
    if (statusLine) {
      if (meta && meta.updated_at) {
        const dt = new Date(meta.updated_at).toLocaleString();
        statusLine.innerHTML = `Active directory: <strong>${totalNow.toLocaleString()} customers</strong> &middot; Last cloud sync: <strong>${escapeHtml(dt)}</strong> by ${escapeHtml(meta.updated_by || 'Team')}`;
      } else {
        statusLine.innerHTML = `Active directory: <strong>${totalNow.toLocaleString()} customers</strong> (loaded from built-in database)`;
      }
    }

    document.getElementById('customerSyncModal')?.classList.add('show');
  }

  function closeCustomerSyncModal() {
    document.getElementById('customerSyncModal')?.classList.remove('show');
    pendingCustomerSyncPreview = null;
  }

  function onCustomerCsvSelected(e) {
    const file = e?.target?.files?.[0];
    const alert = document.getElementById('customerSyncAlert');
    const previewArea = document.getElementById('customerSyncPreviewArea');
    const previewBody = document.getElementById('customerSyncPreviewBody');
    const summaryEl = document.getElementById('customerSyncSummary');
    const confirmBtn = document.getElementById('confirmCustomerSyncBtn');

    if (alert) {
      alert.className = 'form-alert';
      alert.innerText = '';
    }
    pendingCustomerSyncPreview = null;
    if (confirmBtn) confirmBtn.disabled = true;

    if (!file) {
      if (previewArea) previewArea.style.display = 'none';
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result || '';
        const preview = CFM_FIREBASE.previewCustomerSync(text);
        if (!preview || preview.parsedCount === 0) {
          if (alert) {
            alert.className = 'form-alert error';
            alert.innerText = 'No valid customer records were found in this CSV file. Please check the file format.';
          }
          if (previewArea) previewArea.style.display = 'none';
          return;
        }

        pendingCustomerSyncPreview = preview;
        const addedCount = preview.added.length;
        const updatedCount = preview.updated.length;

        if (summaryEl) {
          summaryEl.innerHTML = `Parsed <strong>${preview.parsedCount.toLocaleString()}</strong> rows from CSV: <span style="color:#16a34a;">+${addedCount} New</span> &middot; <span style="color:#2563eb;">${updatedCount} Updated</span> &middot; <span style="color:var(--muted);">${preview.unchangedCount.toLocaleString()} Unchanged</span>`;
        }

        const rowsHtml = [];
        preview.added.forEach(c => {
          const [name, contact, phone, , salesRep, , acct] = c;
          const contactInfo = [contact, phone].filter(Boolean).join(' · ') || '—';
          rowsHtml.push(`
            <tr>
              <td><span style="color:#16a34a; font-weight:700;">+ NEW</span></td>
              <td><strong>${escapeHtml(acct)}</strong></td>
              <td>${escapeHtml(name)}</td>
              <td>${escapeHtml(salesRep || 'Inside Sales')}</td>
              <td style="font-size:12px; color:var(--muted);">${escapeHtml(contactInfo)}</td>
            </tr>
          `);
        });

        preview.updated.forEach(u => {
          const [name, contact, phone, , salesRep, , acct] = u.after;
          const contactInfo = [contact, phone].filter(Boolean).join(' · ') || '—';
          rowsHtml.push(`
            <tr>
              <td><span style="color:#2563eb; font-weight:700;">↻ UPDATED</span></td>
              <td><strong>${escapeHtml(acct)}</strong></td>
              <td>${escapeHtml(name)}</td>
              <td>${escapeHtml(salesRep || 'Inside Sales')}</td>
              <td style="font-size:12px; color:var(--muted);">${escapeHtml(contactInfo)}</td>
            </tr>
          `);
        });

        if (rowsHtml.length === 0) {
          rowsHtml.push(`<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--muted);">All ${preview.parsedCount.toLocaleString()} customers in this file are already up to date!</td></tr>`);
        }

        if (previewBody) previewBody.innerHTML = rowsHtml.join('');
        if (previewArea) previewArea.style.display = 'block';
        if (confirmBtn) confirmBtn.disabled = (addedCount === 0 && updatedCount === 0);
      } catch (err) {
        if (alert) {
          alert.className = 'form-alert error';
          alert.innerText = 'Failed to parse CSV: ' + (err.message || err);
        }
      }
    };
    reader.readAsText(file);
  }

  async function handleConfirmCustomerSync() {
    if (!pendingCustomerSyncPreview) return;
    const confirmBtn = document.getElementById('confirmCustomerSyncBtn');
    const alert = document.getElementById('customerSyncAlert');
    const oldText = confirmBtn ? confirmBtn.innerText : 'Confirm & Sync to Cloud';

    try {
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerText = '⏳ Syncing to Cloud...';
      }
      const changeCount = pendingCustomerSyncPreview.added.length + pendingCustomerSyncPreview.updated.length;
      await CFM_FIREBASE.saveCustomerSync(pendingCustomerSyncPreview.syncRecords, changeCount);
      showToast(`Synced ${ pendingCustomerSyncPreview.added.length } new and ${ pendingCustomerSyncPreview.updated.length } updated customers to Cloud Firestore!`, 'success');
      closeCustomerSyncModal();
    } catch (err) {
      if (alert) {
        alert.className = 'form-alert error';
        alert.innerText = 'Cloud sync failed: ' + (err.message || err);
      }
      if (confirmBtn) {
        confirmBtn.disabled = false;
      }
    } finally {
      if (confirmBtn) {
        confirmBtn.innerText = oldText;
      }
    }
  }

  // Close modals on clicking outside backdrop
  document.addEventListener('click', (e) => {
    if (e.target && e.target.classList.contains('modal-backdrop')) {
      e.target.classList.remove('show');
    }
  });

  // Attach global functions to window
  window.openAuthModal = openAuthModal;
  window.closeAuthModal = closeAuthModal;
  window.setAuthTab = setAuthTab;
  window.handleAuthSubmit = handleAuthSubmit;
  window.handleSignOut = handleSignOut;
  window.openSettingsModal = openSettingsModal;
  window.closeSettingsModal = closeSettingsModal;
  window.onSettingsSnippetInput = onSettingsSnippetInput;
  window.handleSaveSettings = handleSaveSettings;
  window.handleClearSettings = handleClearSettings;
  window.openQuotesModal = openQuotesModal;
  window.closeQuotesModal = closeQuotesModal;
  window.onQuotesSearchInput = onQuotesSearchInput;
  window.handleLoadQuote = handleLoadQuote;
  window.handleDuplicateQuote = handleDuplicateQuote;
  window.handleDeleteQuote = handleDeleteQuote;
  window.onSaveQuoteClicked = handleSaveQuote;
  window.openCustomerSyncModal = openCustomerSyncModal;
  window.closeCustomerSyncModal = closeCustomerSyncModal;
  window.onCustomerCsvSelected = onCustomerCsvSelected;
  window.handleConfirmCustomerSync = handleConfirmCustomerSync;
  window.refreshAuthUI = refreshAuthUI;
  window.showToast = showToast;

  // Initialize on script load / DOM ready
  window.addEventListener('DOMContentLoaded', async () => {
    if (window.CFM_FIREBASE) {
      CFM_FIREBASE.initClient();
      await CFM_FIREBASE.checkSession();
      refreshAuthUI();
    }
  });
})();
