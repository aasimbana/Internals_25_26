/** @odoo-module */

const { Component } = owl;
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { useRef, useState } from "@odoo/owl";
import { BlockUI } from "@web/core/ui/block_ui";
import { download } from "@web/core/network/download";
const actionRegistry = registry.category("actions");

class BankBook extends Component {
  async setup() {
    super.setup(...arguments);
    this.initial_render = true;

    // servicios
    this.orm = useService("orm");
    this.action = useService("action");
    this.dialog = useService("dialog");
    this.notification = useService("notification");

    // refs
    this.tbody = useRef("tbody");
    this.unfoldButton = useRef("unfoldButton");
    this.date_from = useRef("date_from");
    this.date_to = useRef("date_to");

    // estado
    this.state = useState({
    move_line: null,
    data: {},            // <- objeto vacío
    total: null,

    accounts: [],        // <- array vacío
    all_accounts: [],    // <- array vacío
    filteredAccounts: [],// <- array vacío

    selected_account_list: [],
    accounts_all_selected: false,
    accounts_search: "",

    selected_partner: [],
    selected_partner_rec: [],

    date_range: { start_date: "", end_date: "" },
    options: {},

    total_debit: 0,
    total_credit: 0,
    currency: null,

    message_list: [],
    exportDisabled: false,
    dateError: null,
    });
    await this.load_accounts();
  }

  /* -------------------------
   *   Helpers de fechas
   * ------------------------- */
  setDateRange(preset) {
    const today = new Date();
    let startDate, endDate;

    if (preset === "month") {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (preset === "last-month") {
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate   = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (preset === "quarter") {
      const q = Math.floor(today.getMonth() / 3);
      startDate = new Date(today.getFullYear(), q * 3, 1);
      endDate   = new Date(today.getFullYear(), (q + 1) * 3, 0);
    } else if (preset === "last-quarter") {
      const q = Math.floor((today.getMonth() - 3) / 3);
      startDate = new Date(today.getFullYear(), q * 3, 1);
      endDate   = new Date(today.getFullYear(), (q + 1) * 3, 0);
    } else if (preset === "year") {
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate   = new Date(today.getFullYear(), 11, 31);
    } else if (preset === "last-year") {
      startDate = new Date(today.getFullYear() - 1, 0, 1);
      endDate   = new Date(today.getFullYear() - 1, 11, 31);
    } else {
      return;
    }

    const toISO = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const startStr = toISO(startDate);
    const endStr = toISO(endDate);

    this.state.date_range = { start_date: startStr, end_date: endStr };

    if (this.date_from?.el) this.date_from.el.value = startStr;
    if (this.date_to?.el) this.date_to.el.value = endStr;

    // al setear por preset nunca bloqueamos export
    this.state.dateError = null;
    this.state.exportDisabled = false;

    this.render(true);
  }
  // Busca este bloque en tu clase; si no existe, agrégalo tal cual:

updateAccountList(ev) {
    const q = (ev?.target?.value || "").toLowerCase().trim();
    this.state.accounts_search = q;
    const base = (this.state.accounts || []).filter(a => a && a.id != null);
    const filtered = q
      ? base.filter(acc =>
          (acc.display_name || acc.name || "").toLowerCase().includes(q) ||
          (acc.code || "").toLowerCase().includes(q)
        )
      : base;
    this.state.filteredAccounts = [{ id: null, name: "ALL" }, ...filtered];
    this.render(true);
  }
  
  toggleAllAccounts() {
    this.state.accounts_all_selected = !this.state.accounts_all_selected;
    if (this.state.accounts_all_selected) {
      this.state.selected_account_list = []; // vacío = ALL
    }
    this.render(true);
  }
  
  selectAccount(ev) {
    // ¡Este es el handler que falta!
    const id = Number(ev?.currentTarget?.dataset?.id || ev?.target?.dataset?.id);
    if (isNaN(id)) return;
    const set = new Set(this.state.selected_account_list || []);
    set.has(id) ? set.delete(id) : set.add(id);
    this.state.selected_account_list = Array.from(set);
    this.state.accounts_all_selected = false; // si tocas un id, sales de ALL
    this.render(true);
  }
  

  updateFilter(ev) {
    const t = ev?.target;
    if (!t) return;

    // Aseguramos objeto
    if (!this.state.date_range || typeof this.state.date_range !== "object") {
      this.state.date_range = { start_date: "", end_date: "" };
    }

    const normalize = (s) => {
      if (!s) return "";
      if (s.includes("-")) return s; // YYYY-MM-DD
      if (s.includes("/")) {         // DD/MM/YYYY
        const [dd, mm, yyyy] = s.split("/").map(Number);
        return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      }
      return s;
    };

    if (t.name === "start_date") {
      this.state.date_range.start_date = normalize(t.value);
    } else if (t.name === "end_date") {
      this.state.date_range.end_date = normalize(t.value);
    } else {
      // botones rápidos con data-value
      const dv = t.getAttribute?.("data-value");
      if (dv) this.setDateRange(dv);
    }

    // solo UI
    this.render(true);
  }

  validateDateRange() {
    const dr = this.state.date_range || {};
    const parseLocal = (s) => {
      if (!s) return null;
      if (s.includes("-")) {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
      }
      if (s.includes("/")) {
        const [d, m, y] = s.split("/").map(Number);
        return new Date(y, m - 1, d);
      }
      return new Date(s);
    };

    const s = parseLocal(dr.start_date);
    const e = parseLocal(dr.end_date);

    // si ambos vacíos, no bloqueamos
    const bothEmpty =
      (!dr.start_date || dr.start_date === "") &&
      (!dr.end_date || dr.end_date === "");
    if (bothEmpty) {
      this.state.dateError = null;
      this.state.exportDisabled = false;
      return true;
    }

    if (isNaN(s?.getTime()) || isNaN(e?.getTime())) {
      this.state.dateError = "Formato de fecha inválido.";
      this.state.exportDisabled = true;
      return false;
    }

    if (e < s) {
      this.state.dateError = "La fecha final no puede ser menor que la inicial.";
      this.state.exportDisabled = true;
      return false;
    }

    this.state.dateError = null;
    this.state.exportDisabled = false;
    return true;
  }

  /* -------------------------
   *   Catálogo de cuentas
   * ------------------------- */
  async load_accounts() {
    try {
      console.log("Loading accounts...");
      const data = await this.orm.call("bank.book.report", "view_report_bank", []);
      console.log("Accounts data:", data);
      const base = (data?.accounts || []).filter(a => a && a.id != null);
      this.state.accounts = base;
      this.state.all_accounts = [{ id: null, code: "", name: "ALL" }, ...base];
      this.state.filteredAccounts = this.state.all_accounts.slice();
    } catch (e) {
      this.state.accounts = [];
      this.state.all_accounts = [{ id: null, code: "", name: "ALL" }];
      this.state.filteredAccounts = this.state.all_accounts.slice();
    }
    this.render(true);
  }
  

  /* -------------------------
   *   Acciones
   * ------------------------- */
  async onApplyClick(ev) {
    ev?.preventDefault?.();

    // valida fechas si usas objeto {start_date,end_date}
    if (!this.validateDateRange()) {
      this.notification?.add(this.state.dateError || "Rango de fechas inválido.", { type: "danger" });
      return;
    }

    // limpiar vista antes de pedir
    this.state.move_line = null;
    this.state.data = null;
    this.state.total = null;
    this.state.filter_applied = true;

    await this._fetchAndRender();
  }

  async _fetchAndRender() {
    let move_line_list = [];
    let move_line_totals = "";
    let totalDebitSum = 0;
    let totalCreditSum = 0;
    let currency;

    // rango de fechas
    const dr = this.state.date_range || {};
    const isEmptyDR =
      (!dr.start_date || dr.start_date === "") &&
      (!dr.end_date || dr.end_date === "");
    const date_range = isEmptyDR ? null : dr;

    // partners / cuentas / opciones
    const partnersParam = Array.from(this.state.selected_partner || []);
    const accountsParam = Array.from(this.state.selected_account_list || []);
    const optionsParam = this.state.options || {};

    // llamada al backend
    const filtered_data = await this.orm.call(
      "bank.book.report",
      "get_filter_values",
      [partnersParam, date_range, accountsParam, optionsParam]
    );

    // procesar respuesta
    for (const [key, value] of Object.entries(filtered_data || {})) {
      if (key === "move_lines_total") {
        move_line_totals = value;
        for (const mv of Object.values(move_line_totals || {})) {
          currency = mv.currency_id;
          totalDebitSum += mv.total_debit || 0;
          totalCreditSum += mv.total_credit || 0;
        }
      } else {
        move_line_list.push(key);
      }
    }

    // set estado
    this.state.move_line = move_line_list;
    this.state.data = filtered_data;
    this.state.total = move_line_totals;
    this.state.currency = currency;
    this.state.total_debit = totalDebitSum.toFixed(2);
    this.state.total_credit = totalCreditSum.toFixed(2);

    // limpiar toggle unfold si quedó activo
    if (this.unfoldButton?.el?.classList?.contains("selected-filter")) {
      this.unfoldButton.el.classList.remove("selected-filter");
    }

    this.render(true);
  }

  /* -------------------------
   *   Navegación
   * ------------------------- */
  gotoJournalEntry(ev) {
    return this.action.doAction({
      type: "ir.actions.act_window",
      res_model: "account.move",
      res_id: parseInt(ev.target.attributes["data-id"].value, 10),
      views: [[false, "form"]],
      target: "current",
    });
  }

  getDomain() {
    return [];
  }

  /* -------------------------
   *   Export
   * ------------------------- */
  async printPdf(ev) {
    ev.preventDefault();
    if (this.state.exportDisabled) {
      this.notification?.add(this.state.dateError || "Rango de fechas inválido.", { type: "danger" });
      return;
    }

    const totals = {
      total_debit: this.state.total_debit,
      total_credit: this.state.total_credit,
      currency: this.state.currency,
    };
    const action_title = this.props.action.display_name;

    return this.action.doAction({
      type: "ir.actions.report",
      report_type: "qweb-pdf",
      report_name: "dynamic_accounts_report.bank_book",
      report_file: "dynamic_accounts_report.bank_book",
      data: {
        move_lines: this.state.move_line,
        filters: this.filter(),
        grand_total: totals,
        data: this.state.data,
        total: this.state.total,
        title: action_title,
        report_name: this.props.action.display_name,
      },
      display_name: this.props.action.display_name,
    });
  }

  async print_xlsx() {
    if (this.state.exportDisabled) {
      this.notification?.add(this.state.dateError || "Rango de fechas inválido.", { type: "danger" });
      return;
    }

    const action_title = this.props.action.display_name;
    const totals = {
      total_debit: this.state.total_debit,
      total_credit: this.state.total_credit,
      currency: this.state.currency,
    };

    const datas = {
      move_lines: this.state.move_line,
      data: this.state.data,
      total: this.state.total,
      title: action_title,
      filters: this.filter(),
      grand_total: totals,
    };

    const action = {
      data: {
        model: "bank.book.report",
        data: JSON.stringify(datas),
        output_format: "xlsx",
        report_action: this.props.action.xml_id,
        report_name: action_title,
      },
    };

    // BlockUI; // si luego quieres bloquear, implementa correctamente
    await download({
      url: "/xlsx_report",
      data: action.data,
      // complete: () => {}, // evita usar unblockUI inexistente
      error: (error) => this.call("crash_manager", "rpc_error", error),
    });
  }

  /* -------------------------
   *   Filtros (para encabezados)
   * ------------------------- */
  filter() {
    const pad = (n) => String(n).padStart(2, "0");
    const parseLocal = (s) => {
      if (!s) return null;
      if (s.includes("-")) {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(y, m - 1, d);
      }
      if (s.includes("/")) {
        const [d, m, y] = s.split("/").map(Number);
        return new Date(y, m - 1, d);
      }
      return new Date(s);
    };

    const { start_date, end_date } = this.state.date_range || {};
    const s = parseLocal(start_date);
    const e = parseLocal(end_date);

    const filters = {
      partner: this.state.selected_partner_rec,
      account: (this.state.selected_account_list || []).map((id) => {
        const a = (this.state.accounts || []).find((x) => x.id === id);
        return a ? a.display_name || a.name : "";
      }).filter(Boolean),
      options: this.state.options,
      start_date: null,
      end_date: null,
    };

    if (s && e && !isNaN(s.getTime()) && !isNaN(e.getTime())) {
      filters.start_date = `${pad(s.getDate())}/${pad(s.getMonth() + 1)}/${s.getFullYear()}`;
      filters.end_date   = `${pad(e.getDate())}/${pad(e.getMonth() + 1)}/${e.getFullYear()}`;
    }

    return filters;
  }

  /* -------------------------
   *   Unfold/Collapse
   * ------------------------- */
  async unfoldAll(ev) {
    const btn = ev?.target;
    if (!btn) return;

    const isActive = btn.classList.contains("selected-filter");
    for (let i = 0; i < this.tbody.el.children.length; i++) {
      const row = this.tbody.el.children[i];
      if (!row) continue;
      if (!isActive) $(row)[0].classList.add("show");
      else $(row)[0].classList.remove("show");
    }
    btn.classList.toggle("selected-filter", !isActive);
  }
}

BankBook.defaultProps = { resIds: [] };
BankBook.template = "bnk_b_template_new";
actionRegistry.add("bnk_b", BankBook);