// ==============================================================================
// CFM Quote Tool - Supabase UI Controller
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
    const isConfigured = window.CFM_SUPABASE && window.CFM_SUPABASE.isConfigured();
    const user = window.CFM_SUPABASE ? window.CFM_SUPABASE.getCurrentUser() : null;

    const authContainer = document.getElementById('supabaseAuthStatus');
    if (!authContainer) return;

    if (!isConfigured) {
      authContainer.innerHTML = `
        <span class="auth-status-pill" title="Supabase database not connected yet">
          <span class="auth-status-dot"></span> Offline Mode
        </span>
        <button type="button" class="btn-sm btn-primary" onclick="openSettingsModal()">⚙ Connect Supabase</button>
      `;
    } else if (!user) {
      authContainer.innerHTML = `
        <span class="auth-status-pill connected" title="Connected to Supabase">
          <span class="auth-status-dot active"></span> Supabase Ready
        </span>
        <button type="button" class="btn-sm btn-primary" onclick="openAuthModal('signin')">Log In / Sign Up</button>
        <button type="button" class="btn-sm" onclick="openSettingsModal()" title="Supabase Settings">⚙</button>
      `;
    } else {
      authContainer.innerHTML = `
        <span class="auth-status-pill connected" title="Logged in">
          <span class="auth-status-dot active"></span> 👤 ${escapeHtml(user.email)}
        </span>
        <button type="button" class="btn-sm" onclick="handleSignOut()">Sign Out</button>
        <button type="button" class="btn-sm" onclick="openSettingsModal()" title="Supabase Settings">⚙</button>
      `;
    }

    refreshActiveQuoteBanner();
  }

  function refreshActiveQuoteBanner() {
    const banner = document.getElementById('quoteStatusBanner');
    const activeId = window.CFM_SUPABASE ? window.CFM_SUPABASE.getActiveQuoteId() : null;
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
          <button type="button" class="btn-sm" onclick="CFM_SUPABASE.startNewQuote()">+ Start New Quote</button>
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
    setAuthTab(tab);
    modal.classList.add('show');
    document.getElementById('authEmail').focus();
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

    if (tab === 'signin') {
      signinTab?.classList.add('active');
      signupTab?.classList.remove('active');
      if (submitBtn) submitBtn.innerText = 'Log In';
      if (helpText) helpText.innerText = 'Sign in to access and edit your saved quotes across devices.';
    } else {
      signinTab?.classList.remove('active');
      signupTab?.classList.add('active');
      if (submitBtn) submitBtn.innerText = 'Create Account';
      if (helpText) helpText.innerText = 'Create a secure account to save quotes and manage history.';
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
        await CFM_SUPABASE.signIn(email, password);
        showToast('Signed in successfully!', 'success');
        closeAuthModal();
      } else {
        await CFM_SUPABASE.signUp(email, password);
        showToast('Account created! You are now logged in.', 'success');
        closeAuthModal();
      }
      refreshAuthUI();
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
        await CFM_SUPABASE.signOut();
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
    const { url, anonKey } = CFM_SUPABASE.getConfig();
    document.getElementById('settingsUrl').value = url || '';
    document.getElementById('settingsKey').value = anonKey || '';
    const alert = document.getElementById('settingsAlert');
    alert.className = 'form-alert';
    alert.innerText = '';
    modal.classList.add('show');
  }

  function closeSettingsModal() {
    document.getElementById('settingsModal')?.classList.remove('show');
  }

  function handleSaveSettings(e) {
    if (e) e.preventDefault();
    const url = document.getElementById('settingsUrl').value.trim();
    const anonKey = document.getElementById('settingsKey').value.trim();
    const alert = document.getElementById('settingsAlert');

    if (!url || !anonKey) {
      alert.className = 'form-alert error';
      alert.innerText = 'Please provide both your Supabase URL and Anon Key.';
      return;
    }

    try {
      CFM_SUPABASE.updateConfig(url, anonKey);
      showToast('Supabase settings saved and initialized!', 'success');
      closeSettingsModal();
      refreshAuthUI();
    } catch (err) {
      alert.className = 'form-alert error';
      alert.innerText = 'Failed to initialize: ' + err.message;
    }
  }

  function handleClearSettings() {
    if (confirm('Clear Supabase configuration and disconnect?')) {
      CFM_SUPABASE.clearConfig();
      document.getElementById('settingsUrl').value = '';
      document.getElementById('settingsKey').value = '';
      showToast('Supabase configuration cleared.');
      closeSettingsModal();
      refreshAuthUI();
    }
  }

  // --- Save Quote Action ---
  async function handleSaveQuote() {
    if (!CFM_SUPABASE.isConfigured()) {
      showToast('Please connect Supabase first to save quotes.', 'error');
      openSettingsModal();
      return;
    }

    const user = CFM_SUPABASE.getCurrentUser();
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

      const res = await CFM_SUPABASE.saveQuote();
      if (res.action === 'created') {
        showToast(`Quote #${res.quote.quote_number} saved to your cloud account!`, 'success');
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
    if (!CFM_SUPABASE.isConfigured()) {
      showToast('Please connect Supabase first to view saved quotes.', 'error');
      openSettingsModal();
      return;
    }

    const user = CFM_SUPABASE.getCurrentUser();
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
      const quotes = await CFM_SUPABASE.listQuotes(searchTerm);

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
            <td><strong>#${escapeHtml(q.quote_number)}</strong></td>
            <td>${custDisplay} ${acctDisplay}</td>
            <td>${escapeHtml(dateStr)}</td>
            <td style="font-weight:700; color:var(--navy);">${formattedTotal}</td>
            <td style="font-size:12px; color:var(--muted);">${updatedStr}</td>
            <td>
              <div class="quotes-actions-cell">
                <button type="button" class="btn-sm btn-primary" onclick="handleLoadQuote('${q.id}')" title="Load & Edit">Edit</button>
                <button type="button" class="btn-sm" onclick="handleDuplicateQuote('${q.id}')" title="Duplicate as new quote">Duplicate</button>
                <button type="button" class="btn-sm btn-danger" onclick="handleDeleteQuote('${q.id}', '${escapeHtml(q.quote_number)}')" title="Delete Quote">✕</button>
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
    }, 250);
  }

  async function handleLoadQuote(id) {
    try {
      showToast('Loading quote...', 'info');
      await CFM_SUPABASE.loadQuote(id);
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
      await CFM_SUPABASE.loadQuote(id);
      // Detach from existing saved ID so it saves as a brand new quote
      CFM_SUPABASE.setActiveQuoteId(null);
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
      await CFM_SUPABASE.deleteQuote(id);
      showToast(`Quote #${quoteNum} deleted.`, 'success');
      const q = document.getElementById('quotesSearchInput')?.value || '';
      loadQuotesList(q);
      refreshActiveQuoteBanner();
    } catch (err) {
      showToast('Failed to delete quote: ' + err.message, 'error');
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
  window.handleSaveSettings = handleSaveSettings;
  window.handleClearSettings = handleClearSettings;
  window.openQuotesModal = openQuotesModal;
  window.closeQuotesModal = closeQuotesModal;
  window.onQuotesSearchInput = onQuotesSearchInput;
  window.handleLoadQuote = handleLoadQuote;
  window.handleDuplicateQuote = handleDuplicateQuote;
  window.handleDeleteQuote = handleDeleteQuote;
  window.onSaveQuoteClicked = handleSaveQuote;
  window.refreshAuthUI = refreshAuthUI;
  window.showToast = showToast;

  // Initialize on script load / DOM ready
  window.addEventListener('DOMContentLoaded', async () => {
    if (window.CFM_SUPABASE) {
      CFM_SUPABASE.initClient();
      await CFM_SUPABASE.checkSession();
      refreshAuthUI();
    }
  });
})();
