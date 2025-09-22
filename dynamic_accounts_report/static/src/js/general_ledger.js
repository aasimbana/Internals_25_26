/** @odoo-module */

const { Component } = owl;
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { useRef, useState } from "@odoo/owl";
import { BlockUI } from "@web/core/ui/block_ui";
import { download } from "@web/core/network/download";

// Define action registry at the top level
const actionRegistry = registry.category("actions");

class GeneralLedger extends owl.Component {
    setup() {
        this.notification = useService("notification");
        super.setup(...arguments);
        this.initial_render = true;
        this.orm = useService("orm");
        this.action = useService("action");
        this.tbody = useRef("tbody");
        this.date_range_to = useRef("date_to");
        this.date_range_from = useRef("date_from");
        this.unfoldButton = useRef("unfoldButton");
        this.state = useState({
            account: null,
            account_data: null,
            account_data_list: null,
            account_total: null,
            total_debit: null,
            total_credit: null,
            currency: null,
            journals: [],
            selected_journal_list: [],
            analytics: [],
            selected_analytic_list: [],
            accounts: [],
            all_accounts: [],
            filteredAccounts: [],
            selected_account_list: [],
            selected_account_rec: [],
            date_range: { start_date: null, end_date: null }, //siempre objeto
            date_preset: null,
            options: null,
            method: { accrual: true },
            search: '',
            exportDisabled: false,
            dateError: null,
            title: null,
            filter_applied: null,
            account_list: null,
            account_total_list: null,
        });
        this.loadInitialOptions();
    }

    setDateRange(rangeType) {
        const today = new Date();
        let startDate, endDate;
        const y = today.getFullYear();

        if (rangeType === "thisMonth") {
            const m = today.getMonth();
            startDate = new Date(y, m, 1);
            endDate = new Date(y, m + 1, 0);
        } else if (rangeType === "lastMonth") {
            const m = today.getMonth() - 1;
            startDate = new Date(y, m, 1);
            endDate = new Date(y, m + 1, 0);
        }else {
            return;
        }

        const ymd = (d) => {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;   
        }

        const startStr = ymd(startDate);
        const endStr = ymd(endDate);

        this.state.date_range = {start_date: startStr, end_date: endStr};   
        this.state.range_label =
            `${startStr.slice(8,10)}/${startStr.slice(5,7)}/${startStr.slice(0,4)} - ` +
            `${endStr.slice(8,10)}/${endStr.slice(5,7)}/${endStr.slice(0,4)}`;
        if (this.date_range_from?.el) this.date_range_from.el.value = startStr;
        if (this.date_range_to?.el) this.date_range_to.el.value = endStr;
    };


    updateFilter(ev) {
        const t = ev?.target;
        if (!t) return;
      
        // Asegura objeto
        if (!this.state.date_range || typeof this.state.date_range !== "object") {
          this.state.date_range = { start_date: null, end_date: null };
        }
        const normalize = (s) => {
            if (!s) return null;
            // acepta "YYYY-MM-DD" o "DD/MM/YYYY"
            if (s.includes("-")) return s; // ya está ISO
            if (s.includes("/")) {
              const [dd, mm, yyyy] = s.split("/").map(Number);
              return `${yyyy}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
            }
            return s; // fallback
          };
      
        if (t.name === "start_date") {
          this.state.date_range.start_date = normalize(t.value) || null; // "YYYY-MM-DD"
        } else if (t.name === "end_date") {
          this.state.date_range.end_date = normalize(t.value) || null;
        } else {
          // Si usas presets con data-value:
          const dv = t.getAttribute?.("data-value");
          if (dv) {
            // guarda el preset como string en state.date_range (filter ya lo maneja)
            this.state.date_range = dv; // "month" | "year" | ...
            this.state.dateError = null;
            this.state.exportDisabled = false;
          }
        }
      
        // No RPC aquí
        this.render(true);
      }
      
    validateDateRange() {
        const dr = this.state.date_range;
        // Si el date_range es un preset (string), no hay nada que validar
        if (!dr || typeof dr === "string") {
            this.state.dateError = null;
            this.state.exportDisabled = false;
            return true;
        }
        const { start_date, end_date } = dr || {};
        if (!start_date || !end_date) {
            // Si falta una de las dos, no bloqueamos, pero tampoco hay error
            this.state.dateError = null;
            this.state.exportDisabled = false;
            return true;
        }
        const parseLocal = (s) => {
    if (!s) return null;
    if (s.includes("-")) { // YYYY-MM-DD
      const [y, m, d] = s.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    if (s.includes("/")) { // DD/MM/YYYY
      const [d, m, y] = s.split("/").map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date(s);
  };

    const s = parseLocal(start_date);
    const e = parseLocal(end_date);

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

    async loadInitialOptions() {
        // Solo para catálogos iniciales
        const data = await this.orm.call(
            "account.general.ledger",
            "view_report",
            [null, null]
        );

        this.state.journals = data.journal_ids || [];
        this.state.analytics = data.analytic_ids || [];
        this.state.accounts = data.account_ids || [];
        
        const base = (this.state.accounts || []).filter(a => a && a.id != null);
        this.state.all_accounts     = [{ id: null, name: "ALL" }, ...base];
        this.state.filteredAccounts = this.state.all_accounts.slice();
    this.render(true);
    }
    
    selectAccount(e) {
        const raw = (e.currentTarget || e.target)?.dataset?.value;
        if (raw === "null") {
            this.state.selected_account_rec = [];
            
        } else {
            const id = Number(raw);
            const list = this.state.accounts || [];
            const sel = list.find(a => a?.id === id || String(a?.id) === raw);
            this.state.selected_account_rec = sel ? [sel] : []; 
        }
        if(typeof this.load_data === "function") this.load_data(); //Llama a load_data para cargar todas las cuentas
        
        this.render(true);
    }

    // Filtra las cuentas según el valor del campo de búsqueda
    async updateAccountList(event) {
        const value = (event?.target?.value || "").toString().toLowerCase().trim();
        this.state.search = value;

        const base = (this.state.accounts || []).filter(a => a && a.id != null);

    if (!value) {
       
        this.state.filteredAccounts = [{id:null, name:"ALL"}, ...base];
    } else {
       
        const filtered = base.filter(acc => {
            const name = (acc.name || "").toLowerCase();
            const code = (acc.code || "").toLowerCase();
            return name.includes(value) || code.includes(value);
        });
        this.state.filteredAccounts = [{id:null, name:"ALL"}, ...filtered];
    }

    this.render(true); 
    }

    _onAccountPressEnterKey() {
        this.updateAccountList({ target: { value: this.state.search || "" } });
        // if (this.state.search) {
        //     this.filterAccounts(); // Realiza el filtro
        // }
    }
    
    filterAccounts() {
        const value = (this.state.search || "").toLowerCase().trim();
        const base = (this.state.accounts || []).filter(a => a && a.id != null);
      
        const filtered = value
          ? base.filter(acc =>
              (acc.name || "").toLowerCase().includes(value) ||
              (acc.code || "").toLowerCase().includes(value)
            )
          : base;
      
        // mantiene ALL al inicio y NO toca this.state.accounts
        this.state.filteredAccounts = [{ id: null, name: "ALL" }, ...filtered];
      
        this.render(true);
        // const searchQuery = this.state.search ? this.state.search.toLowerCase() : '';
        // if (searchQuery) {
        //     this.state.filteredAccounts = this.state.all_accounts.filter(
        //         (account) =>
        //             (account.name && account.name.toLowerCase().includes(searchQuery)) ||
        //             (account.code && account.code.toLowerCase().includes(searchQuery))
        //     );
        //     this.state.accounts = this.state.filteredAccounts; // Actualizamos la lista con las cuentas filtradas
        // } else {
        //     this.state.filteredAccounts = [...this.state.all_accounts];
        // }
        // this.render(true);
    }
     
    // Método para cargar todas las cuentas
    async fetchAccounts() {
        const data = await this.orm.call(
            "account.general.ledger",
            "view_report",
            [null, null]
        );
        const base = (data.account_ids || []).filter(a => a && a.id != null);
        this.state.accounts = base; 

        this.state.all_accounts = [{ id: null, name:"ALL"}, ...base];
        this.state.filteredAccounts = this.state.all_accounts.slice();

        this.render(true);
    }
    async printPdf(ev) {
        ev.preventDefault();
        // No exportar si hay error de fechas
        if (this.state.exportDisabled) {
            this.notification?.add(this.state.dateError || "Rango de fechas inválido.", { type: "danger" });
            return;
        }
        
        var self = this;
        let totals = {
            total_debit: this.state.total_debit,
            total_credit: this.state.total_credit,
            currency: this.state.currency,
        };
        var action_title = self.props.action.display_name;
        return self.action.doAction({
            type: "ir.actions.report",
            report_type: "qweb-pdf",
            report_name: "dynamic_accounts_report.general_ledger",
            report_file: "dynamic_accounts_report.general_ledger",
            data: {
                account: self.state.account,
                data: self.state.account_data,
                total: self.state.account_total,
                title: action_title,
                filters: this.filter(),
                grand_total: totals,
                report_name: self.props.action.display_name,
            },
            display_name: self.props.action.display_name,
        });
    }
    async print_xlsx() {
        // No exportar si hay error de fechas
        if (this.state.exportDisabled) {
            this.notification?.add(this.state.dateError || "Rango de fechas inválido.", { type: "danger" });
            return;
        }
        var self = this;
        let totals = {
            total_debit: this.state.total_debit,
            total_credit: this.state.total_credit,
            currency: this.state.currency,
        };
        var action_title = self.props.action.display_name;
        var datas = {
            account: self.state.account,
            data: self.state.account_data,
            total: self.state.account_total,
            title: action_title,
            filters: this.filter(),
            grand_total: totals,
        };
        var action = {
            data: {
                model: "account.general.ledger",
                data: JSON.stringify(datas),
                output_format: "xlsx",
                report_action: self.props.action.xml_id,
                report_name: action_title,
            },
        };
        BlockUI;
        await download({
            url: "/xlsx_report",
            data: action.data,
            complete: () => unblockUI,
            error: (error) => self.call("crash_manager", "rpc_error", error),
        });
    }
    gotoJournalEntry(ev) {
        
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "account.move",
            res_id: parseInt(ev.target.attributes["data-id"].value, 10),
            views: [[false, "form"]],
            target: "current",
        });
    }
    gotoJournalItem(ev) {
        
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "account.move.line",
            name: "Journal Items",
            views: [[false, "list"]],
            domain: [
                [
                    "account_id",
                    "=",
                    parseInt(ev.target.attributes["data-id"].value, 10),
                ],
            ],
            target: "current",
        });
    }
    getDomain() {
        return [];
    }
    async applyFilter() {
        debugger;

        this.state.account = null;
        this.state.account_data = null;
        this.state.account_total = null;
        this.state.filter_applied = true;

        let account_list = [];
        let account_total = "";
        let totalDebitSum = 0;
        let totalCreditSum = 0;

        // const target = val?.target;
        // const dataValue = target?.getAttribute?.("data-value");
        // const inputName = target?.name;

        
        this.state.selected_journal_list = [...new Set(this.state.selected_journal_list)];
        this.state.selected_analytic_list = [...new Set(this.state.selected_analytic_list)];
        this.state.selected_account_list = [...new Set(this.state.selected_account_list)];

        // si la validación falla
        if (typeof this.state.date_range === "object" && !this.validateDateRange()) {
            this.notification?.add(this.state.dateError || "Rango de fechas inválido.", { type: "danger" });
            this.render(true);
            return;
        }

        //  Preparar parámetros con fallbacks seguros 
        const journal_ids = Array.from(this.state.selected_journal_list || []);
        const rawDR = this.state.date_range || {};

        const isEmptyDateRange =
            typeof rawDR === "object" &&
            (!rawDR.start_date || rawDR.start_date === "") &&
            (!rawDR.end_date   || rawDR.end_date   === "");
        const date_range = isEmptyDateRange ? null : rawDR;
       
        const options = this.state.options || {};           // el backend ya interpreta {} → posted
        const analytic = Array.from(this.state.selected_analytic_list || []);
        const method = this.state.method || { accrual: true };

        //
        const account_ids = (this.state.selected_account_list?.length
            ? [...this.state.selected_account_list]
            : (this.state.selected_account_rec || []).map((a) => a.id));
        
        debugger;
        
        

        // --- 4) Llamada al servidor ---
        const filtered_data = await this.orm.call(
            "account.general.ledger",
            "get_filter_values",
            [journal_ids, date_range, options, analytic, method, account_ids]
        );

        // (Opcional) refrescar catálogos si vienen en la respuesta
        this.state.journals = filtered_data.journal_ids || this.state.journals;
        this.state.analytics = filtered_data.analytic_ids || this.state.analytics;
        this.state.accounts = filtered_data.account_ids || this.state.accounts;

        const base = (this.state.accounts || []).filter(a => a && a.id != null);
        this.state.all_accounts = [{ id: null, name: "ALL" }, ...base];
        this.state.filteredAccounts = [{ id: null, name: "ALL" }, ...base];
        // const q = (this.state.search || "").toLowerCase();

        // const filteredLocal = q
        //   ? base.filter(a =>
        //       (a.name || "").toLowerCase().includes(q) ||
        //       (a.code || "").toLowerCase().includes(q)
        //     )
        //   : base;

        

        // --- 5) Procesar totales y líneas ---
        const account_totals = filtered_data.account_totals || {};
        for (const accTot of Object.values(account_totals)) {
            totalDebitSum += accTot?.total_debit || 0;
            totalCreditSum += accTot?.total_credit || 0;
        }

        // Limpiar/normalizar estructura de líneas por cuenta
        const cleaned_account_data = {};
        for (const [key, value] of Object.entries(filtered_data)) 
            
            {
            if (["account_totals","journal_ids","analytic_ids","account_ids"].includes(key)) continue;
                account_list.push(key);
            
            if (Array.isArray(value) && value.length) {
                // value es lista de listas (cada move_line.read devuelve una lista)
                const flat = value.flat(); // profundidad 1 basta
                cleaned_account_data[key] = flat.map((v) => (Array.isArray(v) ? v[0] : v));
            } else {
                cleaned_account_data[key] = [];
            }
        }

        account_list = [...new Set(account_list)];
        this.state.currency = (Object.values(account_totals)[0] || {}).currency_id || "";
        this.state.account = account_list;
        this.state.account_data = cleaned_account_data;
        this.state.account_total = account_totals;
        this.state.total_debit = totalDebitSum.toFixed(2);
        this.state.total_credit = totalCreditSum.toFixed(2);

        // --- 6) Limpiar toggle de "desplegar todo" si estaba activo ---
        if (this.unfoldButton?.el?.classList?.contains("selected-filter")) {
            this.unfoldButton.el.classList.remove("selected-filter");
        }

        // Redibujar
        this.render(true);
    }

    async unfoldAll(ev) {
        debugger;
        if (!ev.target.classList.contains("selected-filter")) {
            for (var length = 0; length < this.tbody.el.children.length; length++) {
                $(this.tbody.el.children[length])[0].classList.add("show");
            }
            ev.target.classList.add("selected-filter");
        } else {
            for (var length = 0; length < this.tbody.el.children.length; length++) {
                $(this.tbody.el.children[length])[0].classList.remove("show");
            }
            ev.target.classList.remove("selected-filter");
        }
    }
    filter() {
        debugger;
        var self = this;
        let startDate, endDate;
        let startMonth, startDay, startYear, endMonth, endDay, endYear;
    
        const pad = (n) =>String(n).padStart(2, "0");
        const parseLocal = (s) => {
            if (!s) return null;
            if (s.includes("-")) {
                const [y, m, d] = s.split("-").map(Number);
                return new Date(y, m - 1, d);
            }
            if (s.includes("/")){
                const [d, m, y] = s.split("/").map(Number);
                return new Date(y, m -1, d);
            }
            return new Date(s);
        };

        const selectedJournalIDs = Array.from(self.state.selected_journal_list || []);
        const selectedJournalNames = selectedJournalIDs
            .map((journalID) => {
                const j = (self.state.journals || []).find((jj) => jj.id === journalID);
                return j ? j.name : "";
            })
            .filter(Boolean);
        if (self.state.date_range) {
            const today = new Date();
            if (self.state.date_range === "quarter") {
                const currentQuarter = Math.floor(today.getMonth() / 3);
                startDate = new Date(today.getFullYear(), currentQuarter * 3, 1);
                endDate = new Date(today.getFullYear(), (currentQuarter + 1) * 3, 0);
            } else if (self.state.date_range === "month") {
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            } else if (self.state.date_range === "last-month") {
                startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                endDate = new Date(today.getFullYear(), today.getMonth(), 0);
            } else if (self.state.date_range === "last-quarter") {
                const lastQuarter = Math.floor((today.getMonth() - 3) / 3);
                startDate = new Date(today.getFullYear(), lastQuarter * 3, 1);
                endDate = new Date(today.getFullYear(), (lastQuarter + 1) * 3, 0);
            } else {
                startDate = self.state.date_range.start_date ? parseLocal(self.state.date_range.start_date) : null;
                endDate = self.state.date_range.end_date ? parseLocal(self.state.date_range.end_date) : null;
            }
            // Get the date components for start and end dates
    
            if (startDate) {
                startYear = startDate.getFullYear();
                startMonth = startDate.getMonth() + 1;
                startDay = startDate.getDate();
                
            }
            if (endDate) { 
                endYear = endDate.getFullYear();
                endMonth = endDate.getMonth() + 1;
                endDay = endDate.getDate();
            }
        }
        const selectedAnalyticIDs = Array.from(self.state.selected_analytic_list || []);
        const selectedAnalyticNames = selectedAnalyticIDs
            .map((analyticID) => {
                const analytic = (self.state.analytics || []).find((a) => a.id === analyticID);
                return analytic ? analytic.name : "";
            })
            .filter(Boolean);

        const filters = {
            journal: selectedJournalNames,
            analytic: selectedAnalyticNames,
            account: self.state.selected_account_rec,
            options: self.state.options,
            start_date: null,
            end_date: null,
        };
      
        if (
            startYear !== undefined &&
            startMonth !== undefined &&
            startDay !== undefined &&
            endYear !== undefined &&
            endMonth !== undefined &&
            endDay !== undefined
        ) {
            filters["start_date"] = `${pad(startDay)}/${pad(startMonth)}/${startYear}`;
            filters["end_date"]   = `${pad(endDay)}/${pad(endMonth)}/${endYear}`;
        }
        return filters;
    }
}
    GeneralLedger.defaultProps = {
        resIds: [],
    };
    GeneralLedger.template = "gl_template_new";
    actionRegistry.add("gen_l", GeneralLedger);
