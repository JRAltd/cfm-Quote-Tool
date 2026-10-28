// ==============================================================================
// CFM Quote Tool - Firebase Integration Client (Firebase Auth + Cloud Firestore)
// ==============================================================================

(function() {
  let app = null;
  let auth = null;
  let db = null;
  let currentUser = null;
  let activeQuoteId = null; // null if creating a new quote, document ID if editing an existing quote
  let authReadyPromise = null;
  let authUnsubscribe = null;

  const STORAGE_KEY = 'cfm_firebase_config';

  // Parse a raw Firebase config snippet or JSON string into a config object
  function parseConfigSnippet(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Try strict JSON first
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {}

    // Extract key-value pairs from JS object snippet (e.g. const firebaseConfig = { apiKey: "...", ... })
    const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
    const extracted = {};
    let foundAny = false;
    keys.forEach(k => {
      const regex = new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`);
      const match = trimmed.match(regex);
      if (match && match[1]) {
        extracted[k] = match[1].trim();
        foundAny = true;
      }
    });
    return foundAny ? extracted : null;
  }

  // Get configuration from localStorage or window.FIREBASE_CONFIG
  function getConfig() {
    const fileConfig = window.FIREBASE_CONFIG || {};
    let storedConfig = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        storedConfig = JSON.parse(raw) || {};
      }
    } catch (e) {
      console.warn('Could not parse stored Firebase config:', e);
    }

    const apiKey = (storedConfig.apiKey || fileConfig.apiKey || '').trim();
    const projectId = (storedConfig.projectId || fileConfig.projectId || '').trim();
    const authDomain = (storedConfig.authDomain || fileConfig.authDomain || (projectId ? `${projectId}.firebaseapp.com` : '')).trim();
    const storageBucket = (storedConfig.storageBucket || fileConfig.storageBucket || (projectId ? `${projectId}.appspot.com` : '')).trim();
    const messagingSenderId = (storedConfig.messagingSenderId || fileConfig.messagingSenderId || '').trim();
    const appId = (storedConfig.appId || fileConfig.appId || '').trim();

    return {
      apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId,
      appId
    };
  }

  function isConfigured() {
    const { apiKey, projectId } = getConfig();
    return Boolean(apiKey && projectId);
  }

  function initClient() {
    const config = getConfig();
    if (!config.apiKey || !config.projectId || !window.firebase) {
      app = null;
      auth = null;
      db = null;
      return false;
    }

    try {
      // Clean up previous auth listener if re-initializing
      if (typeof authUnsubscribe === 'function') {
        authUnsubscribe();
        authUnsubscribe = null;
      }

      // Check if default app already exists
      if (window.firebase.apps && window.firebase.apps.length > 0) {
        const existingApp = window.firebase.app();
        const existingOpts = existingApp.options || {};
        if (existingOpts.apiKey === config.apiKey && existingOpts.projectId === config.projectId) {
          app = existingApp;
        } else {
          // Delete old app instance asynchronously and create a new named/default one
          const appName = 'cfm-app-' + Date.now();
          app = window.firebase.initializeApp(config, appName);
        }
      } else {
        app = window.firebase.initializeApp(config);
      }

      auth = window.firebase.auth(app);
      db = window.firebase.firestore(app);

      authReadyPromise = new Promise((resolve) => {
        let resolved = false;
        authUnsubscribe = auth.onAuthStateChanged((user) => {
          currentUser = user || null;
          if (!resolved) {
            resolved = true;
            resolve(currentUser);
          }
          if (typeof window.refreshAuthUI === 'function') {
            window.refreshAuthUI();
          }
          if (currentUser) {
            loadCustomerSync().catch(e => console.warn('Customer cloud sync check skipped:', e.message));
          }
        }, (err) => {
          console.warn('Firebase Auth state error:', err);
          currentUser = null;
          if (!resolved) {
            resolved = true;
            resolve(null);
          }
        });
      });

      return true;
    } catch (err) {
      console.error('Failed to initialize Firebase client:', err);
      app = null;
      auth = null;
      db = null;
      return false;
    }
  }

  function formatFirebaseError(err) {
    if (!err) return 'An unknown error occurred.';
    const code = err.code || '';
    switch (code) {
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/user-disabled':
        return 'This user account has been disabled.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
      case 'auth/invalid-login-credentials':
        return 'Invalid email or password. Please try again.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. Try signing in instead.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters long.';
      case 'auth/operation-not-allowed':
        return 'Email/Password sign-in is not enabled in your Firebase Console (Authentication -> Sign-in method).';
      case 'permission-denied':
        return 'Permission denied by Firestore Security Rules. Verify you are signed in and rules are published.';
      default:
        return err.message || String(err);
    }
  }

  // --- Auth APIs ---
  async function checkSession() {
    if (!auth) return null;
    try {
      if (authReadyPromise) {
        await authReadyPromise;
      }
      currentUser = auth.currentUser || null;
      return currentUser;
    } catch (e) {
      console.warn('Session check warning:', e.message);
      currentUser = null;
      return null;
    }
  }

  function getUserProfile(user) {
    if (!user) return { name: '', email: '' };
    const email = user.email || '';
    let name = user.displayName || '';
    if (!name && email) {
      const localPart = email.split('@')[0];
      name = localPart
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();
    }
    return { name, email };
  }

  async function signUp(email, password, fullName = '') {
    if (!auth) throw new Error('Firebase is not configured yet. Please connect your Firebase project first.');
    try {
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      if (fullName && fullName.trim() && userCredential.user) {
        await userCredential.user.updateProfile({ displayName: fullName.trim() });
      }
      currentUser = auth.currentUser || userCredential.user;
      return { user: currentUser };
    } catch (err) {
      throw new Error(formatFirebaseError(err));
    }
  }

  async function signIn(email, password) {
    if (!auth) throw new Error('Firebase is not configured yet. Please connect your Firebase project first.');
    try {
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      currentUser = userCredential.user;
      return { user: currentUser };
    } catch (err) {
      throw new Error(formatFirebaseError(err));
    }
  }

  async function signOut() {
    if (!auth) return;
    try {
      await auth.signOut();
      currentUser = null;
      activeQuoteId = null;
    } catch (err) {
      throw new Error(formatFirebaseError(err));
    }
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

    const quotedByNameEl = document.getElementById('quotedByName');
    const quotedBySelectEl = document.getElementById('quotedBy');
    let quotedBy = '';
    if (quotedByNameEl) {
      quotedBy = quotedByNameEl.value.trim();
    } else if (quotedBySelectEl) {
      const isManual = quotedBySelectEl.value === 'manual';
      quotedBy = isManual ? (document.getElementById('manualQuotedBy')?.value || '') : (quotedBySelectEl.value || '');
    }
    const quotedByEmail = (document.getElementById('quotedByEmail')?.value || '').trim();

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
        const price = r.cells[6]?.querySelector('span')?.innerText.trim() || '$0.00';
        const total = r.cells[7]?.querySelector('span')?.innerText.trim() || '$0.00';
        items.push({
          type: 'item',
          leadTime,
          qty,
          model,
          description: desc,
          cost,
          markup,
          price,
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
        const amount = (r.querySelector('.section-amount span') || r.cells[7]?.querySelector('span'))?.innerText.trim() || '$0.00';
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
      quote_number: String(quoteNum),
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
    const nameInput = document.getElementById('quotedByName');
    const emailInput = document.getElementById('quotedByEmail');
    if (nameInput) {
      nameInput.value = quote.quoted_by || '';
    }
    if (emailInput) {
      emailInput.value = quote.quoted_by_email || '';
    }
    const qbSelect = document.getElementById('quotedBy');
    if (qbSelect) {
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
        const mqb = document.getElementById('manualQuotedBy');
        if (mqb) { mqb.value = quote.quoted_by; mqb.style.display = 'inline-block'; }
      }
    }
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
          r.innerHTML = `<td><div class="edit-box" contenteditable="true" data-placeholder="Lead time">${window.esc ? window.esc(item.leadTime || '') : (item.leadTime || '')}</div></td><td class="qty-col"><input type="number" value="${item.qty !== undefined ? item.qty : 1}" min="0" oninput="calc()"></td><td><div class="edit-box" contenteditable="true" data-placeholder="Model/Part #">${window.esc ? window.esc(item.model || '') : (item.model || '')}</div></td><td><div class="edit-box" contenteditable="true" data-placeholder="Item name/description">${window.esc ? window.esc(item.description || '') : (item.description || '')}</div></td><td class="internal right"><input type="number" value="${item.cost !== undefined ? item.cost : 0}" step="0.01" oninput="calc()"></td><td class="internal right"><input type="number" value="${item.markup !== undefined ? item.markup : 0}" step="0.01" oninput="calc()"></td><td class="right price-col"><span>${window.esc ? window.esc(item.price || '$0.00') : (item.price || '$0.00')}</span></td><td class="right total-col"><span>${window.esc ? window.esc(item.total || '$0.00') : (item.total || '$0.00')}</span></td>` + (typeof window.actions === 'function' ? window.actions() : '');
        } else if (item.type === 'note') {
          const r = tb.insertRow();
          r.className = 'line-note';
          r.innerHTML = `<td></td><td></td><td></td><td><div class="note-text edit-box" contenteditable="true" data-placeholder="Line item note">${window.esc ? window.esc(item.text || '') : (item.text || '')}</div></td><td class="internal"></td><td class="internal"></td><td></td><td></td>` + (typeof window.actions === 'function' ? window.actions() : '');
        } else if (item.type === 'subtotal') {
          const r = tb.insertRow();
          r.className = 'project-subtotal';
          r.innerHTML = `<td></td><td></td><td class="right" style="padding-right:15px; font-weight:bold;">Subtotal:</td><td><div class="edit-box" contenteditable="true" data-placeholder="Section name (optional)">${window.esc ? window.esc(item.label || '') : (item.label || '')}</div></td><td class="internal"></td><td class="internal"></td><td></td><td class="right section-amount"><span>${window.esc ? window.esc(item.amount || '$0.00') : (item.amount || '$0.00')}</span></td>` + (typeof window.actions === 'function' ? window.actions() : '');
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

  // --- Cloud Firestore CRUD ---
  async function saveQuote() {
    if (!db) throw new Error('Firebase is not configured yet.');
    if (!currentUser) throw new Error('Please log in first to save quotes.');

    const nowIso = new Date().toISOString();
    const quotePayload = serializeCurrentQuote();
    quotePayload.user_id = currentUser.uid;
    quotePayload.updated_at = nowIso;

    try {
      if (activeQuoteId) {
        // Update existing quote document in Firestore
        const docRef = db.collection('quotes').doc(activeQuoteId);
        await docRef.set(quotePayload, { merge: true });
        return {
          action: 'updated',
          quote: { id: activeQuoteId, ...quotePayload }
        };
      } else {
        // Create new quote document in Firestore
        quotePayload.created_at = nowIso;
        const docRef = await db.collection('quotes').add(quotePayload);
        activeQuoteId = docRef.id;
        return {
          action: 'created',
          quote: { id: docRef.id, ...quotePayload }
        };
      }
    } catch (err) {
      throw new Error(formatFirebaseError(err));
    }
  }

  async function listQuotes(search = '') {
    if (!db) throw new Error('Firebase is not configured.');
    if (!currentUser) throw new Error('Please log in to view your quotes.');

    try {
      const snapshot = await db
        .collection('quotes')
        .where('user_id', '==', currentUser.uid)
        .get();

      let results = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        results.push({
          id: doc.id,
          quote_number: d.quote_number || '',
          customer_name: d.customer_name || '',
          account_number: d.account_number || '',
          po_number: d.po_number || '',
          quote_date: d.quote_date || '',
          total: d.total || 0,
          updated_at: d.updated_at || d.created_at || '',
          created_at: d.created_at || ''
        });
      });

      // Sort by updated_at descending in memory (avoids requiring manual composite index creation in Firestore)
      results.sort((a, b) => {
        const tA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const tB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return tB - tA;
      });

      // Client-side case-insensitive search filter
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        results = results.filter(item =>
          (item.customer_name && item.customer_name.toLowerCase().includes(q)) ||
          (item.quote_number && String(item.quote_number).toLowerCase().includes(q)) ||
          (item.account_number && item.account_number.toLowerCase().includes(q)) ||
          (item.po_number && item.po_number.toLowerCase().includes(q))
        );
      }

      return results;
    } catch (err) {
      throw new Error(formatFirebaseError(err));
    }
  }

  async function loadQuote(id) {
    if (!db) throw new Error('Firebase is not configured.');
    try {
      const doc = await db.collection('quotes').doc(id).get();
      if (!doc.exists) {
        throw new Error('Quote not found in Firestore.');
      }
      const data = { id: doc.id, ...doc.data() };
      populateQuoteIntoDOM(data);
      return data;
    } catch (err) {
      throw new Error(formatFirebaseError(err));
    }
  }

  async function deleteQuote(id) {
    if (!db) throw new Error('Firebase is not configured.');
    try {
      await db.collection('quotes').doc(id).delete();
      if (activeQuoteId === id) {
        activeQuoteId = null;
      }
    } catch (err) {
      throw new Error(formatFirebaseError(err));
    }
  }

  function startNewQuote() {
    if (!confirm('Start a new blank quote? Any unsaved changes will be lost.')) return;
    activeQuoteId = null;
    if (typeof window.resetQuoteDirect === 'function') {
      window.resetQuoteDirect();
    }
  }

  // --- NetSuite Customer CSV Parser & Cloud Sync ---
  const CUSTOMER_CACHE_KEY = 'cfm_customer_sync_v1';
  let lastCustomerSyncMeta = null;
  let cachedSyncRecords = [];

  function parseCSVLine(line) {
    const res = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          res.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
    }
    res.push(cur.trim());
    return res;
  }

  function parseNetSuiteCSV(csvText) {
    if (!csvText || typeof csvText !== 'string') return [];
    const lines = csvText.split(/\r?\n/);

    // Detect header row (or default to standard NetSuite Current Customer List report layout)
    let headerIdx = -1;
    let colMap = { customer: 0, acct: -1, contact: -1, phone: -1, email: -1, salesRep: 1, status: -1 };

    for (let i = 0; i < Math.min(lines.length, 25); i++) {
      const cols = parseCSVLine(lines[i]).map(c => c.toLowerCase().trim());
      if (cols.length >= 2 && (cols.includes('customer') || cols.includes('name') || cols.includes('company name') || cols.includes('id'))) {
        headerIdx = i;
        colMap = {
          customer: cols.findIndex(c => c === 'customer' || c === 'name' || c === 'company name'),
          acct: cols.findIndex(c => c === 'account' || c === 'account number' || c === 'account #' || c === 'id' || c === 'entity id'),
          contact: cols.findIndex(c => c.includes('contact')),
          phone: cols.findIndex(c => c.includes('phone')),
          email: cols.findIndex(c => c.includes('email') || c.includes('e-mail')),
          salesRep: cols.findIndex(c => c.includes('sales rep') || c === 'rep'),
          status: cols.findIndex(c => c.includes('status') || c.includes('stage'))
        };
        if (colMap.customer === -1 && colMap.acct !== -1) {
          colMap.customer = colMap.acct;
        }
        break;
      }
    }

    const byAcct = new Map();
    const startRow = headerIdx !== -1 ? headerIdx + 1 : 0;

    for (let i = startRow; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;

      const cols = parseCSVLine(rawLine);
      const rawCust = (cols[colMap.customer >= 0 ? colMap.customer : 0] || '').trim();
      if (!rawCust) continue;

      // Skip NetSuite report title, date range, header, and summary rows
      if (
        /^total\s*-/i.test(rawCust) ||
        /^total$/i.test(rawCust) ||
        /^customer$/i.test(rawCust) ||
        /^cfm\s+(distributors|current customer)/i.test(rawCust) ||
        /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d+/i.test(rawCust)
      ) {
        continue;
      }

      let acct = (colMap.acct >= 0 && colMap.acct !== colMap.customer ? (cols[colMap.acct] || '').trim() : '');
      let name = rawCust;

      // NetSuite Current Customer List combines "<Account #> <Customer Name>" in column 0
      const prefixMatch = rawCust.match(/^([A-Z0-9]+(?::\d+)?)\s+(.+)$/i);
      if (!acct && prefixMatch) {
        acct = prefixMatch[1].trim();
        name = prefixMatch[2].trim();
      } else if (acct && name.toUpperCase().startsWith(acct.toUpperCase() + ' ')) {
        name = name.slice(acct.length).trim();
      }

      if (!acct || !name) continue;

      const contact = colMap.contact >= 0 ? (cols[colMap.contact] || '').trim() : '';
      const phone = colMap.phone >= 0 ? (cols[colMap.phone] || '').trim() : '';
      const email = colMap.email >= 0 ? (cols[colMap.email] || '').trim() : '';
      const salesRep = colMap.salesRep >= 0 ? (cols[colMap.salesRep] || '').trim() : '';
      const status = (colMap.status >= 0 ? (cols[colMap.status] || '').trim() : '') || 'CUSTOMER-Active';

      const key = acct.toUpperCase();
      if (byAcct.has(key)) {
        // Merge duplicate parent/child rows in NetSuite report
        const prev = byAcct.get(key);
        if (!prev[0] && name) prev[0] = name;
        if (!prev[1] && contact) prev[1] = contact;
        if (!prev[2] && phone) prev[2] = phone;
        if (!prev[3] && email) prev[3] = email;
        if (!prev[4] && salesRep) prev[4] = salesRep;
        if ((!prev[5] || prev[5] === 'CUSTOMER-Active') && status) prev[5] = status;
      } else {
        byAcct.set(key, [name, contact, phone, email, salesRep, status, acct]);
      }
    }

    return Array.from(byAcct.values());
  }

  function applyCustomerSyncRecords(records) {
    if (typeof CUSTOMERS === 'undefined' || !Array.isArray(CUSTOMERS) || !Array.isArray(records)) return;

    const byAcct = new Map();
    CUSTOMERS.forEach(c => {
      if (c && c[6]) byAcct.set(String(c[6]).toUpperCase(), c);
    });

    records.forEach(r => {
      if (!Array.isArray(r) || !r[6]) return;
      const key = String(r[6]).toUpperCase();
      if (byAcct.has(key)) {
        const existing = byAcct.get(key);
        if (r[0]) existing[0] = r[0];
        if (r[1]) existing[1] = r[1];
        if (r[2]) existing[2] = r[2];
        if (r[3]) existing[3] = r[3];
        if (r[4]) existing[4] = r[4];
        if (r[5]) existing[5] = r[5];
      } else {
        const newEntry = [
          r[0] || '',
          r[1] || '',
          r[2] || '',
          r[3] || '',
          r[4] || 'Inside Sales',
          r[5] || 'CUSTOMER-Active',
          r[6]
        ];
        CUSTOMERS.push(newEntry);
        byAcct.set(key, newEntry);
      }
    });

    CUSTOMERS.sort((a, b) => String(a[0] || '').toLowerCase().localeCompare(String(b[0] || '').toLowerCase()));
  }

  function previewCustomerSync(csvText) {
    const parsed = parseNetSuiteCSV(csvText);
    const currentList = (typeof CUSTOMERS !== 'undefined' && Array.isArray(CUSTOMERS)) ? CUSTOMERS : [];
    const existingByAcct = new Map();
    currentList.forEach(c => {
      if (c && c[6]) existingByAcct.set(String(c[6]).toUpperCase(), c);
    });

    const added = [];
    const updated = [];
    let unchangedCount = 0;

    parsed.forEach(row => {
      const [name, contact, phone, email, salesRep, status, acct] = row;
      const key = String(acct).toUpperCase();
      if (!existingByAcct.has(key)) {
        added.push([name, contact, phone, email, salesRep || 'Inside Sales', status || 'CUSTOMER-Active', acct]);
      } else {
        const ex = existingByAcct.get(key);
        const nameChanged = Boolean(name && name !== ex[0]);
        const contactChanged = Boolean(contact && contact !== ex[1]);
        const phoneChanged = Boolean(phone && phone !== ex[2]);
        const emailChanged = Boolean(email && email !== ex[3]);
        const repChanged = Boolean(salesRep && salesRep !== ex[4]);

        if (nameChanged || contactChanged || phoneChanged || emailChanged || repChanged) {
          updated.push({
            before: [...ex],
            after: [
              name || ex[0],
              contact || ex[1],
              phone || ex[2],
              email || ex[3],
              salesRep || ex[4],
              status || ex[5],
              ex[6]
            ]
          });
        } else {
          unchangedCount++;
        }
      }
    });

    // Combine previously synced records with newly added/updated records
    const combinedByAcct = new Map();
    cachedSyncRecords.forEach(r => {
      if (r && r[6]) combinedByAcct.set(String(r[6]).toUpperCase(), r);
    });
    added.forEach(r => combinedByAcct.set(String(r[6]).toUpperCase(), r));
    updated.forEach(u => combinedByAcct.set(String(u.after[6]).toUpperCase(), u.after));

    return {
      parsedCount: parsed.length,
      added,
      updated,
      unchangedCount,
      syncRecords: Array.from(combinedByAcct.values())
    };
  }

  function loadLocalCustomerCache() {
    try {
      const raw = localStorage.getItem(CUSTOMER_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.records)) {
        cachedSyncRecords = parsed.records;
        lastCustomerSyncMeta = parsed.meta || null;
        applyCustomerSyncRecords(cachedSyncRecords);
      }
    } catch (e) {
      console.warn('Could not load cached customer sync:', e);
    }
  }

  async function loadCustomerSync() {
    loadLocalCustomerCache();
    if (!db || !currentUser) return lastCustomerSyncMeta;

    try {
      const doc = await db.collection('customer_sync').doc('latest').get();
      if (!doc.exists) return lastCustomerSyncMeta;

      const data = doc.data();
      const records = JSON.parse(data.customers_json || '[]');
      cachedSyncRecords = Array.isArray(records) ? records : [];
      lastCustomerSyncMeta = {
        updated_at: data.updated_at || '',
        updated_by: data.updated_by || '',
        total_count: data.total_count || 0,
        new_count: data.new_count || 0
      };

      try {
        localStorage.setItem(CUSTOMER_CACHE_KEY, JSON.stringify({
          meta: lastCustomerSyncMeta,
          records: cachedSyncRecords
        }));
      } catch (_) {}

      applyCustomerSyncRecords(cachedSyncRecords);
      return lastCustomerSyncMeta;
    } catch (err) {
      console.warn('Could not fetch customer_sync/latest:', err.message);
      return lastCustomerSyncMeta;
    }
  }

  async function saveCustomerSync(syncRecords, newCount = 0) {
    if (!db) throw new Error('Firebase is not configured yet.');
    if (!currentUser) throw new Error('Please log in first to sync customers to Cloud Firestore.');

    const nowIso = new Date().toISOString();
    const { name, email } = getUserProfile(currentUser);
    const updatedBy = name ? `${name} (${email})` : (email || 'User');

    // Merge with any existing cachedSyncRecords
    const mergedMap = new Map();
    cachedSyncRecords.forEach(r => {
      if (r && r[6]) mergedMap.set(String(r[6]).toUpperCase(), r);
    });
    (syncRecords || []).forEach(r => {
      if (r && r[6]) mergedMap.set(String(r[6]).toUpperCase(), r);
    });
    const finalRecords = Array.from(mergedMap.values());

    applyCustomerSyncRecords(finalRecords);
    const totalCustomersNow = (typeof CUSTOMERS !== 'undefined' && Array.isArray(CUSTOMERS)) ? CUSTOMERS.length : finalRecords.length;

    const payload = {
      customers_json: JSON.stringify(finalRecords),
      updated_at: nowIso,
      updated_by: updatedBy.slice(0, 200),
      total_count: totalCustomersNow,
      new_count: Number(newCount) || 0
    };

    try {
      await db.collection('customer_sync').doc('latest').set(payload);
      cachedSyncRecords = finalRecords;
      lastCustomerSyncMeta = {
        updated_at: payload.updated_at,
        updated_by: payload.updated_by,
        total_count: payload.total_count,
        new_count: payload.new_count
      };
      try {
        localStorage.setItem(CUSTOMER_CACHE_KEY, JSON.stringify({
          meta: lastCustomerSyncMeta,
          records: cachedSyncRecords
        }));
      } catch (_) {}
      return lastCustomerSyncMeta;
    } catch (err) {
      throw new Error(formatFirebaseError(err));
    }
  }

  // Apply local cache immediately on script load
  loadLocalCustomerCache();

  // Save config into localStorage
  function updateConfig(configObj) {
    const cleaned = {
      apiKey: (configObj.apiKey || '').trim(),
      projectId: (configObj.projectId || '').trim(),
      authDomain: (configObj.authDomain || (configObj.projectId ? `${configObj.projectId.trim()}.firebaseapp.com` : '')).trim(),
      storageBucket: (configObj.storageBucket || (configObj.projectId ? `${configObj.projectId.trim()}.appspot.com` : '')).trim(),
      messagingSenderId: (configObj.messagingSenderId || '').trim(),
      appId: (configObj.appId || '').trim()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    initClient();
  }

  function clearConfig() {
    localStorage.removeItem(STORAGE_KEY);
    if (typeof authUnsubscribe === 'function') {
      authUnsubscribe();
      authUnsubscribe = null;
    }
    app = null;
    auth = null;
    db = null;
    currentUser = null;
    activeQuoteId = null;
  }

  // Export API to window.CFM_FIREBASE (and alias CFM_SUPABASE for backwards compatibility)
  const api = {
    initClient,
    getConfig,
    parseConfigSnippet,
    isConfigured,
    updateConfig,
    clearConfig,
    checkSession,
    getUserProfile,
    signUp,
    signIn,
    signOut,
    saveQuote,
    listQuotes,
    loadQuote,
    deleteQuote,
    startNewQuote,
    parseNetSuiteCSV,
    previewCustomerSync,
    loadCustomerSync,
    saveCustomerSync,
    getCustomerSyncMeta: () => lastCustomerSyncMeta,
    getActiveQuoteId: () => activeQuoteId,
    setActiveQuoteId: (id) => { activeQuoteId = id; },
    getCurrentUser: () => currentUser
  };

  window.CFM_FIREBASE = api;
  window.CFM_SUPABASE = api;
})();
