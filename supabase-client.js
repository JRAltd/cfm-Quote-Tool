// ==============================================================================
// CFM Quote Tool - Supabase Integration Client
// ==============================================================================

(function() {
  let supabase = null;
  let currentUser = null;
  let activeQuoteId = null; // null if creating a new quote, UUID if editing an existing quote

  // Get configuration from window.SUPABASE_CONFIG or localStorage
  function getConfig() {
    const config = window.SUPABASE_CONFIG || {};
    const url = (localStorage.getItem('cfm_supabase_url') || config.url || '').trim();
    const anonKey = (localStorage.getItem('cfm_supabase_anon_key') || config.anonKey || '').trim();
    return { url, anonKey };
  }

  function isConfigured() {
    const { url, anonKey } = getConfig();
    return Boolean(url && anonKey && url.startsWith('http'));
  }

  function initClient() {
    const { url, anonKey } = getConfig();
    if (url && anonKey && window.supabase) {
      try {
        supabase = window.supabase.createClient(url, anonKey);
        return true;
      } catch (err) {
        console.error('Failed to initialize Supabase client:', err);
      }
    }
    supabase = null;
    return false;
  }

  // --- Auth APIs ---
  async function checkSession() {
    if (!supabase) return null;
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      currentUser = session ? session.user : null;
      return currentUser;
    } catch (e) {
      console.warn('Session check warning:', e.message);
      currentUser = null;
      return null;
    }
  }

  async function signUp(email, password) {
    if (!supabase) throw new Error('Supabase is not configured yet. Please enter your project URL & Key.');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    currentUser = data.user;
    return data;
  }

  async function signIn(email, password) {
    if (!supabase) throw new Error('Supabase is not configured yet. Please enter your project URL & Key.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    return data;
  }

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    currentUser = null;
    activeQuoteId = null;
  }

  // --- Quote Serializer & Deserializer ---
  function serializeCurrentQuote() {
    const quoteNum = document.getElementById('quoteNumRef').value || '';
    const customer = document.getElementById('customerSearch').value || '';
    const quoteDate = document.getElementById('quoteDate').value || null;
    const expDate = document.getElementById('expDate').value || null;
    const poNumber = document.getElementById('poNumber').value || '';
    const acctNumber = document.getElementById('acctNumber').value || '';
    const contactName = document.getElementById('contactName').value || '';
    const contactPhone = document.getElementById('contactPhone').value || '';
    const freight = parseFloat(document.getElementById('freight').value) || 0;

    const qbSelect = document.getElementById('quotedBy');
    const isManual = qbSelect.value === 'manual';
    const quotedBy = isManual ? (document.getElementById('manualQuotedBy').value || '') : (qbSelect.value || '');
    const quotedByEmail = document.getElementById('quotedByEmail').value || '';

    // Extract items from table body
    const tb = document.getElementById('tb');
    const items = [];
    [...tb.rows].forEach(r => {
      if (r.classList.contains('item-row')) {
        const leadTime = r.cells[0]?.querySelector('.edit-box')?.innerText.trim() || '';
        const qty = parseFloat(r.cells[1]?.querySelector('input')?.value) || 0;
        const model = r.cells[2]?.querySelector('.edit-box')?.innerText.trim() || '';
        const desc = r.cells[3]?.querySelector('.edit-box')?.innerText.trim() || '';
        const cost = parseFloat(r.cells[4]?.querySelector('input')?.value) || 0;
        const markup = parseFloat(r.cells[5]?.querySelector('input')?.value) || 0;
        const total = r.cells[6]?.querySelector('span')?.innerText.trim() || '$0.00';
        items.push({
          type: 'item',
          leadTime,
          qty,
          model,
          description: desc,
          cost,
          markup,
          total
        });
      } else if (r.classList.contains('line-note')) {
        const noteText = r.cells[3]?.querySelector('.edit-box')?.innerText.trim() || '';
        items.push({
          type: 'note',
          text: noteText
        });
      } else if (r.classList.contains('project-subtotal')) {
        const label = r.cells[3]?.querySelector('.edit-box')?.innerText.trim() || '';
        const amount = r.cells[6]?.querySelector('span')?.innerText.trim() || '$0.00';
        items.push({
          type: 'subtotal',
          label,
          amount
        });
      }
    });

    // Extract general notes
    const notesArea = document.getElementById('notesArea');
    const notes = [];
    notesArea.querySelectorAll('.note-text').forEach(n => {
      const text = n.innerText.trim();
      if (text) notes.push(text);
    });

    // Extract total amount
    const totalRaw = document.getElementById('tot').innerText.replace(/[^0-9.-]+/g, '');
    const total = parseFloat(totalRaw) || 0;

    return {
      quote_number: quoteNum,
      customer_name: customer,
      quote_date: quoteDate || null,
      expiration_date: expDate || null,
      po_number: poNumber,
      account_number: acctNumber,
      contact_name: contactName,
      contact_phone: contactPhone,
      quoted_by: quotedBy,
      quoted_by_email: quotedByEmail,
      freight: freight,
      total: total,
      items: items,
      notes: notes
    };
  }

  function populateQuoteIntoDOM(quote) {
    // Populate header & contact
    document.getElementById('quoteNumRef').value = quote.quote_number || '';
    document.getElementById('customerSearch').value = quote.customer_name || '';
    document.getElementById('quoteDate').value = quote.quote_date || '';
    document.getElementById('expDate').value = quote.expiration_date || '';
    document.getElementById('poNumber').value = quote.po_number || '';
    document.getElementById('acctNumber').value = quote.account_number || '';
    document.getElementById('contactName').value = quote.contact_name || '';
    document.getElementById('contactPhone').value = quote.contact_phone || '';
    document.getElementById('freight').value = (quote.freight !== undefined && quote.freight !== null) ? quote.freight : '';

    // Populate Quoted By
    const qbSelect = document.getElementById('quotedBy');
    const manualInput = document.getElementById('manualQuotedBy');
    const emailInput = document.getElementById('quotedByEmail');
    let matchedOption = false;
    for (let i = 0; i < qbSelect.options.length; i++) {
      if (qbSelect.options[i].value === quote.quoted_by) {
        qbSelect.selectedIndex = i;
        matchedOption = true;
        break;
      }
    }
    if (!matchedOption && quote.quoted_by) {
      qbSelect.value = 'manual';
      manualInput.value = quote.quoted_by;
      manualInput.style.display = 'inline-block';
      emailInput.readOnly = false;
    }
    emailInput.value = quote.quoted_by_email || '';
    if (typeof window.syncQuotedBy === 'function') {
      window.syncQuotedBy();
    }

    // Populate Table Items
    const tb = document.getElementById('tb');
    tb.replaceChildren();

    const items = Array.isArray(quote.items) ? quote.items : [];
    if (items.length === 0) {
      if (typeof window.addRow === 'function') window.addRow();
    } else {
      items.forEach(item => {
        if (item.type === 'item') {
          const r = tb.insertRow();
          r.className = 'item-row';
          r.innerHTML = `<td><div class="edit-box" contenteditable="true" data-placeholder="Lead time">${window.esc ? window.esc(item.leadTime || '') : (item.leadTime || '')}</div></td><td class="qty-col"><input type="number" value="${item.qty !== undefined ? item.qty : 1}" min="0" oninput="calc()"></td><td><div class="edit-box" contenteditable="true" data-placeholder="Model/Part #">${window.esc ? window.esc(item.model || '') : (item.model || '')}</div></td><td><div class="edit-box" contenteditable="true" data-placeholder="Item name/description">${window.esc ? window.esc(item.description || '') : (item.description || '')}</div></td><td class="internal right"><input type="number" value="${item.cost !== undefined ? item.cost : 0}" step="0.01" oninput="calc()"></td><td class="internal right"><input type="number" value="${item.markup !== undefined ? item.markup : 0}" step="0.01" oninput="calc()"></td><td class="right"><span>$0.00</span></td>` + (typeof window.actions === 'function' ? window.actions() : '');
        } else if (item.type === 'note') {
          const r = tb.insertRow();
          r.className = 'line-note';
          r.innerHTML = `<td></td><td></td><td></td><td><div class="note-text edit-box" contenteditable="true" data-placeholder="Line item note">${window.esc ? window.esc(item.text || '') : (item.text || '')}</div></td><td class="internal"></td><td class="internal"></td><td></td>` + (typeof window.actions === 'function' ? window.actions() : '');
        } else if (item.type === 'subtotal') {
          const r = tb.insertRow();
          r.className = 'project-subtotal';
          r.innerHTML = `<td></td><td></td><td class="right" style="padding-right:15px; font-weight:bold;">Subtotal:</td><td><div class="edit-box" contenteditable="true" data-placeholder="Section name (optional)">${window.esc ? window.esc(item.label || '') : (item.label || '')}</div></td><td class="internal"></td><td class="internal"></td><td class="right section-amount"><span>$0.00</span></td>` + (typeof window.actions === 'function' ? window.actions() : '');
        }
      });
    }

    // Populate General Notes
    const notesArea = document.getElementById('notesArea');
    notesArea.replaceChildren();
    const notes = Array.isArray(quote.notes) ? quote.notes : [];
    notes.forEach(noteText => {
      const d = document.createElement('div');
      d.contentEditable = true;
      d.className = 'edit-box note-text';
      d.style.marginTop = '10px';
      d.dataset.placeholder = 'Enter note here...';
      d.innerText = noteText;
      notesArea.appendChild(d);
    });

    // Re-calculate totals
    if (typeof window.calc === 'function') window.calc();

    // Set active quote ID
    activeQuoteId = quote.id;
  }

  // --- Database CRUD ---
  async function saveQuote() {
    if (!supabase) throw new Error('Supabase is not configured yet.');
    if (!currentUser) throw new Error('Please log in first to save quotes.');

    const quotePayload = serializeCurrentQuote();
    quotePayload.user_id = currentUser.id;

    if (activeQuoteId) {
      // Update existing quote
      const { data, error } = await supabase
        .from('quotes')
        .update(quotePayload)
        .eq('id', activeQuoteId)
        .select()
        .single();
      if (error) throw error;
      return { action: 'updated', quote: data };
    } else {
      // Create new quote
      const { data, error } = await supabase
        .from('quotes')
        .insert(quotePayload)
        .select()
        .single();
      if (error) throw error;
      activeQuoteId = data.id;
      return { action: 'created', quote: data };
    }
  }

  async function listQuotes(search = '') {
    if (!supabase) throw new Error('Supabase is not configured.');
    if (!currentUser) throw new Error('Please log in to view your quotes.');

    let query = supabase
      .from('quotes')
      .select('id, quote_number, customer_name, account_number, quote_date, total, updated_at, created_at')
      .order('updated_at', { ascending: false });

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      query = query.or(`customer_name.ilike.${q},quote_number.ilike.${q},account_number.ilike.${q},po_number.ilike.${q}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function loadQuote(id) {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    populateQuoteIntoDOM(data);
    return data;
  }

  async function deleteQuote(id) {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase
      .from('quotes')
      .delete()
      .eq('id', id);
    if (error) throw error;
    if (activeQuoteId === id) {
      activeQuoteId = null;
    }
  }

  function startNewQuote() {
    if (!confirm('Start a new blank quote? Any unsaved changes will be lost.')) return;
    activeQuoteId = null;
    if (typeof window.resetQuoteDirect === 'function') {
      window.resetQuoteDirect();
    }
  }

  // Save config into localStorage
  function updateConfig(url, anonKey) {
    if (url) localStorage.setItem('cfm_supabase_url', url.trim());
    if (anonKey) localStorage.setItem('cfm_supabase_anon_key', anonKey.trim());
    initClient();
  }

  function clearConfig() {
    localStorage.removeItem('cfm_supabase_url');
    localStorage.removeItem('cfm_supabase_anon_key');
    supabase = null;
    currentUser = null;
  }

  // Export API to window.CFM_SUPABASE
  window.CFM_SUPABASE = {
    initClient,
    getConfig,
    isConfigured,
    updateConfig,
    clearConfig,
    checkSession,
    signUp,
    signIn,
    signOut,
    saveQuote,
    listQuotes,
    loadQuote,
    deleteQuote,
    startNewQuote,
    getActiveQuoteId: () => activeQuoteId,
    setActiveQuoteId: (id) => { activeQuoteId = id; },
    getCurrentUser: () => currentUser
  };
})();
