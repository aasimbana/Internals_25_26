/** @odoo-module */

const { Component } = owl;
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { useRef, useState } from "@odoo/owl";
// import { BlockUI } from "@web/core/ui/block_ui";
import { download } from "@web/core/network/download";

const actionRegistry = registry.category("actions");

class CashBook extends Component {
    setup() {
        super.setup(...arguments);
        // Servicios
        this.notification = useService("notification");
        this.orm = useService("orm");
        this.action = useService("action");
        this.dialog = useService("dialog");
        this.ui = useService("ui");   // <= aquí

        // Refs
        this.tbody = useRef("tbody");
        this.unfoldButton = useRef("unfoldButton");
        this.date_from = useRef("date_from");
        this.date_to   = useRef("date_to");


        // Estado
        this.state = useState({
            // Datos principales
            move_line: null,          // claves de secciones (por cuenta / bloque)
            data: null,               // payload crudo del backend
            total: null,              // totales por sección
            currency: null,
            total_debit: null,
            total_credit: null,

            // Catálogos / selección
            accounts: [],             // [{id, display_name, name}, ...]
            accountNameById: {},       // { id: name }
            account_search: "",     //buscador
            filteredAccounts: [],       // 📋 lista filtrada para el menú
            selected_account_list: [],  // [ids]
            accounts_all_selected: true,// ALL activo por defecto
            selected_partner: [],     // [ids]
            selected_partner_rec: [], // [{id, name, ...}]

            // Filtros de tiempo
            date_range: { start_date: null, end_date: null }, // también puede ser string "month"/"last-month"
            options: {},              // {draft: true} etc.

            // UI / validación
            filter_applied: null,
            exportDisabled: false,
            dateError: null,
            message_list: [],
        });

        // Carga inicial de cuentas CASH
        this.load_cash_accounts();
    }

    // ---------- Utilidades de fecha (UNIFICADAS) ----------
    _toISO(date) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }

    _normalizeToISO(str) {
        if (!str) return null;
        if (str.includes("-")) return str; // YYYY-MM-DD
        if (str.includes("/")) {
            const [dd, mm, yyyy] = str.split("/").map(Number);
            return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        }
        return str;
    }

    _parseLocalDate(str) {
        if (!str) return null;
        if (str.includes("-")) {
            const [y, m, d] = str.split("-").map(Number);
            return new Date(y, m - 1, d);
        }
        if (str.includes("/")) {
            const [d, m, y] = str.split("/").map(Number);
            return new Date(y, m - 1, d);
        }
        return new Date(str);
    }

    _calculateDateRange(preset) {
        const today = new Date();
        let startDate, endDate;
      
        if (preset === "month" || preset === "thisMonth") {
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        } else if (preset === "last-month" || preset === "lastMonth") {
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
            return null;
        }

        return {
            start_date: this._toISO(startDate),
            end_date: this._toISO(endDate)
        };
    }

    setDateRange(preset) {
        const range = this._calculateDateRange(preset);
        if (!range) return;

        this.state.date_range = range;
      
        // ⬇️ Usa los refs correctos
        if (this.date_from?.el) this.date_from.el.value = range.start_date;
        if (this.date_to?.el)   this.date_to.el.value   = range.end_date;
      
        this.state.dateError = null;
        this.state.exportDisabled = false;
        this.render(true);
    }

    updateFilter(ev) {
        const t = ev?.target;
        if (!t) return;
      
        // asegura objeto
        if (!this.state.date_range || typeof this.state.date_range !== "object") {
            this.state.date_range = { start_date: null, end_date: null };
        }
      
        // preset con data-value -> calcula y rellena
        const dv = t.getAttribute?.("data-value");
        if (dv) {
            this.setDateRange(dv);      // ← aquí se rellenan inputs y state
            this.render(true);
            return;
        }
      
        // cambios manuales en inputs
        if (t.name === "start_date") {
            this.state.date_range.start_date = this._normalizeToISO(t.value);
        }
        if (t.name === "end_date") {
            this.state.date_range.end_date = this._normalizeToISO(t.value);
        }
      
        this.render(true);
    }

    validateDateRange() {
        const dr = this.state.date_range;

        // Si es preset string, se acepta sin validar aquí (se resolverá a fechas)
        if (!dr || typeof dr === "string") {
            this.state.dateError = null;
            this.state.exportDisabled = false;
            return true;
        }

        const { start_date, end_date } = dr || {};
        if (!start_date || !end_date) {
            // Falta uno: no hay error, pero tampoco bloqueamos
            this.state.dateError = null;
            this.state.exportDisabled = false;
            return true;
        }

        const s = this._parseLocalDate(start_date);
        const e = this._parseLocalDate(end_date);

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

    updateAccountList(ev) {
        const q = (ev?.target?.value || "").toLowerCase().trim();
        this.state.account_search = q;
        const base = this.state.accounts || [];
        this.state.filteredAccounts = q
            ? base.filter(j => (j.name || "").toLowerCase().includes(q) || (j.code || "").toLowerCase().includes(q))
            : base.slice();
        this.render(true);
    }

    selectAccount(ev) {
        const id = Number(ev?.currentTarget?.dataset?.id || ev?.target?.dataset?.id);
        if (Number.isNaN(id)) return;
        const set = new Set(this.state.selected_account_list || []);
        set.has(id) ? set.delete(id) : set.add(id);
        this.state.selected_account_list = Array.from(set);
        this.state.accounts_all_selected = false;
        this.render(true);
    }

    toggleAllAccounts() {
        this.state.accounts_all_selected = !this.state.accounts_all_selected;
        if (this.state.accounts_all_selected) {
            // Si activas ALL, limpias selección específica
            this.state.selected_account_list = [];
        }
        this.render(true);
    }
      
    // ---------- Carga de cuentas ----------
    async load_cash_accounts() {
        try {
            console.log("fetching data");
            const data = await this.orm.call("cash.book.report", "view_report_cash", []);
            console.log(data);
            if (data && data.accounts) {
                this.state.data = data;
                this.state.accounts = data.accounts;
                this.state.accountNameById = Object.fromEntries(
                    (this.state.accounts || []).map((a) => [a.id, a.name || ""])
                );
                // Inicializa la lista de cuentas filtradas
                this.state.filteredAccounts = (this.state.accounts || []).slice();
            } else {
                this.state.accounts = [];
                this.state.accountNameById = {};
                this.state.filteredAccounts = [];
                console.warn("No se encontraron cuentas (cash)");
            }
            return this.state.accounts;
        } catch (error) {
            console.error("Error al cargar cuentas (cash):", error);
            this.state.accounts = [];
            this.state.accountNameById = {};
            this.state.filteredAccounts = [];
            return [];
        }
    }

    // ---------- Resolver date_range para RPC ----------
    _resolveDateRangeForRPC() {
        const dr = this.state.date_range;
        
        // Si ya es objeto, devuélvelo
        if (!dr || typeof dr === "object") {
            const isEmpty = dr && !dr.start_date && !dr.end_date;
            return isEmpty ? null : dr;
        }

        // Si es string (preset), calcula las fechas
        const range = this._calculateDateRange(dr);
        return range || null;
    }

    // ---------- Exportaciones ----------
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
                filters: this._filtersForExport(), // Fechas DD/MM/YYYY y labels
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

        const totals = {
            total_debit: this.state.total_debit,
            total_credit: this.state.total_credit,
            currency: this.state.currency,
        };

        const action_title = this.props.action.display_name;

        const datas = {
            move_lines: this.state.move_line,
            data: this.state.data,
            total: this.state.total,
            title: action_title,
            filters: this._filtersForExport(), // Fechas DD/MM/YYYY y labels
            grand_total: totals,
        };

        const action = {
            data: {
                model: "cash.book.report",
                data: JSON.stringify(datas),
                output_format: "xlsx",
                report_action: this.props.action?.xml_id,
                report_name: action_title,
            },
        };

        const unblock = this.ui.block();
        try {
            await download({ url: "/xlsx_report", data: action.data });
        } catch (error) {
            console.error(error);
            this.notification?.add("Fallo al generar XLSX", { type: "danger" });
            throw error;
        } finally {
            if (typeof unblock === "function") unblock();   // <= desbloquea
        }
    }

    // ---------- Aplicar filtros (consulta al backend) ----------
    async applyFilter(evOrVal, ev, is_delete = false) {
        // Limpia estado de datos previos
        this.state.move_line = null;
        this.state.data = null;
        this.state.total = null;
        this.state.filter_applied = true;

        let totalDebitSum = 0;
        let totalCreditSum = 0;

        // --- Manejo de partners y toggles (modo legacy de tu UI) ---
        if (ev) {
            // Select2 de partner
            if (ev.input && ev.input.attributes.placeholder?.value === "Partner" && !is_delete) {
                this.state.selected_partner.push(evOrVal[0].id);
                this.state.selected_partner_rec.push(evOrVal[0]);
            } else if (is_delete) {
                const idx = this.state.selected_partner_rec.indexOf(evOrVal);
                if (idx >= 0) {
                    this.state.selected_partner_rec.splice(idx, 1);
                }
                this.state.selected_partner = this.state.selected_partner_rec.map((rec) => rec.id);
            }
        } else if (evOrVal?.target) {
            const t = evOrVal.target;

            // Inputs de fecha
            if (t.name === "start_date") {
                const startISO = this._normalizeToISO(t.value);
                const current = typeof this.state.date_range === "object" ? this.state.date_range : {};
                this.state.date_range = { ...current, start_date: startISO };
            } else if (t.name === "end_date") {
                const endISO = this._normalizeToISO(t.value);
                const current = typeof this.state.date_range === "object" ? this.state.date_range : {};
                this.state.date_range = { ...current, end_date: endISO };
            } else {
                const dv = t.getAttribute?.("data-value");
                if (dv === "month" || dv === "last-month" || dv === "quarter" || dv === "last-quarter" || dv === "year" || dv === "last-year") {
                    // Guardar preset como string; lo convertimos a objeto antes del RPC
                    this.state.date_range = dv;
                } else if (dv === "draft") {
                    if (t.classList.contains("selected-filter")) {
                        const { draft, ...rest } = this.state.options || {};
                        this.state.options = rest;
                        t.classList.remove("selected-filter");
                    } else {
                        this.state.options = { ...(this.state.options || {}), draft: true };
                        t.classList.add("selected-filter");
                    }
                } else if (dv === "account") {
                    const id = parseInt(t.getAttribute("data-id"), 10);
                    if (!t.classList.contains("selected-filter")) {
                        this.state.selected_account_list = [...new Set([...(this.state.selected_account_list || []), id])];
                        t.classList.add("selected-filter");
                    } else {
                        this.state.selected_account_list = (this.state.selected_account_list || []).filter((x) => x !== id);
                        t.classList.remove("selected-filter");
                    }
                }
            }
        }

        // --- Validación de fechas (si es objeto) ---
        if (typeof this.state.date_range === "object" && !this.validateDateRange()) {
            this.notification?.add(this.state.dateError || "Rango de fechas inválido.", { type: "danger" });
            this.render(true);
            return;
        }

        // --- Preparar parámetros para el backend ---
        const date_range = this._resolveDateRangeForRPC();
        const partner_ids = Array.from(this.state.selected_partner || []);
        const account_ids = this.state.accounts_all_selected ? null : Array.from(this.state.selected_account_list || []);
        const options = this.state.options || {}; // {} → posted en backend

        // --- Llamada al backend ---
        const filtered_data = await this.orm.call(
            "cash.book.report",
            "get_filter_values",
            [partner_ids, date_range, account_ids, options]
        );

        // --- Procesar respuesta ---
        // Recalculo de totales
        let move_line_list = [];
        let move_line_totals = "";

        for (const [key, value] of Object.entries(filtered_data)) {
            if (key !== "move_lines_total") {
                move_line_list.push(key);
            } else {
                move_line_totals = value;
                Object.values(move_line_totals).forEach((mv) => {
                    totalDebitSum += mv.total_debit || 0;
                    totalCreditSum += mv.total_credit || 0;
                    this.state.currency = mv.currency_id || this.state.currency;
                });
            }
        }

        this.state.move_line = move_line_list;
        this.state.data = filtered_data;
        this.state.total = move_line_totals;
        this.state.total_debit = totalDebitSum.toFixed(2);
        this.state.total_credit = totalCreditSum.toFixed(2);

        // Limpiar toggle de unfold si estaba activo
        if (this.unfoldButton?.el?.classList?.contains("selected-filter")) {
            this.unfoldButton.el.classList.remove("selected-filter");
        }

        this.render(true);
    }

    _filtersForExport() {
        
        const pad = (n) => String(n).padStart(2, "0");

        const dr = this._resolveDateRangeForRPC() || {};
        const s = this._parseLocalDate(dr.start_date);
        const e = this._parseLocalDate(dr.end_date);

        const start_date = s ? `${pad(s.getDate())}/${pad(s.getMonth() + 1)}/${s.getFullYear()}` : null;
        const end_date   = e ? `${pad(e.getDate())}/${pad(e.getMonth() + 1)}/${e.getFullYear()}` : null;

        // Nombres de cuentas seleccionados
        const accountNames = this.state.accounts_all_selected
            ? ["ALL"]
            : (this.state.selected_account_list || [])
                .map((id) => this.state.accountNameById[id] || "")
                .filter(Boolean);

        return {
            partner: this.state.selected_partner_rec, // objetos (para mostrar)
            account: accountNames,                    // nombres legibles
            options: this.state.options,
            start_date,
            end_date,
        };
    }

    // ---------- Navegación ----------
    gotoJournalEntry(ev) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "account.move",
            res_id: parseInt(ev.target.getAttribute("data-id"), 10),
            views: [[false, "form"]],
            target: "current",
        });
    }

    // ---------- UI: plegar/desplegar ----------
    async unfoldAll(ev) {
        const btn = ev.target;
        const children = this.tbody?.el?.children || [];
        const toAdd = !btn.classList.contains("selected-filter");
        for (let i = 0; i < children.length; i++) {
            if (toAdd) {
                children[i].classList.add("show");
            } else {
                children[i].classList.remove("show");
            }
        }
        btn.classList.toggle("selected-filter", toAdd);
    }
}

CashBook.template = "csh_b_template_new";
actionRegistry.add("csh_b", CashBook);