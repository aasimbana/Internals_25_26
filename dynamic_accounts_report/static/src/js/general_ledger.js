/** @odoo-module */

const {Component} = owl;
import {registry} from "@web/core/registry";
import {useService} from "@web/core/utils/hooks";
import {useRef, useState} from "@odoo/owl";
import {BlockUI} from "@web/core/ui/block_ui";
import {download} from "@web/core/network/download";
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
            all_accounts:[],
            filteredAccounts:[],
            selected_account_list: [],
            selected_account_rec: [],
            date_range: null,
            options: null,
            method: { accrual: true }, 
            search:'',
            exportDisabled: false,
            dateError: null,
            title: null,
            filter_applied: null,
            account_list: null,
            account_total_list: null,
        });
        this.loadInitialOptions();
        //this.load_data((self.initial_render = true));
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
        const s = new Date(start_date);
        const e = new Date(end_date);
        if (isNaN(s.getTime()) || isNaN(e.getTime())) {
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
      
        this.state.journals  = data.journal_ids  || [];
        this.state.analytics = data.analytic_ids || [];
        this.state.accounts  = data.account_ids  || [];
        this.state.filteredAccounts = Array.isArray(this.state.accounts) ? [...this.state.accounts] : [];
      }      

    selectAccount(event) {
        const accountId = event.target.dataset.value;
        if (accountId === "null") {
            // Si el usuario selecciona "All", seleccionamos todas las cuentas
            this.state.selected_account_rec = [];
            this.load_data(); // Llama a load_data para cargar todas las cuentas
        } else {
            // Buscar la cuenta específica
            const selectedAccount = this.state.filteredAccounts.find(
                (account) => account.id == accountId
            );
            if (selectedAccount) {
                this.state.selected_account_rec = [selectedAccount];
            }
        }
        this.render(true); 
    }

    // Filtra las cuentas según el valor del campo de búsqueda
    async updateAccountList(event) {
        this.state.search = event.target.value.toLowerCase(); // Guardamos el valor de la búsqueda
        if (event.code === "Enter") {
            // Si se presiona Enter
            this._onAccountPressEnterKey();
        } else {
            // Si no es Enter, solo filtra
            this.filterAccounts();
        }
    }
    
    _onAccountPressEnterKey() {
        if (this.state.search) {
            this.filterAccounts(); // Realiza el filtro
        }
    }

    filterAccounts() {
        const searchQuery = this.state.search ? this.state.search.toLowerCase() : '';
        if (searchQuery) {
            this.state.filteredAccounts = this.state.all_accounts.filter(
                (account) =>
                    (account.name && account.name.toLowerCase().includes(searchQuery)) || 
                    (account.code && account.code.toLowerCase().includes(searchQuery))
            );
            this.state.accounts = this.state.filteredAccounts; // Actualizamos la lista con las cuentas filtradas
        } else {
            this.state.filteredAccounts = [...this.state.all_accounts];
        }
        this.render(true);
    }

    // Método para cargar todas las cuentas
    async fetchAccounts() {
        debugger;
        const data = await this.orm.call(
            "account.general.ledger",
            "view_report",
            [null, null]
        );
        this.state.all_accounts = data.account_ids || [];
        this.state.accounts = data.account_ids || [];
        this.state.filteredAccounts = [...this.state.all_accounts];
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
        debugger;
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "account.move",
            res_id: parseInt(ev.target.attributes["data-id"].value, 10),
            views: [[false, "form"]],
            target: "current",
        });
    }
    gotoJournalItem(ev) {
        debugger;
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
    async applyFilter(val, ev, is_delete = false) {
        debugger;
      
        this.state.account = null;
        this.state.account_data = null;
        this.state.account_total = null;
        this.state.filter_applied = true;

        let account_list = [];
        let account_total = "";
        let totalDebitSum = 0;
        let totalCreditSum = 0;
      
        const target = val?.target;
        const dataValue = target?.getAttribute?.("data-value");
        const inputName = target?.name;
      
        // 1) Actualizar date_range según el origen del evento
        if (inputName === "start_date") {
          this.state.date_range = {
            ...(typeof this.state.date_range === "object" ? this.state.date_range : {}),
            start_date: this.date_range_from.el?.value || "",
          };
        } else if (inputName === "end_date") {
          this.state.date_range = {
            ...(typeof this.state.date_range === "object" ? this.state.date_range : {}),
            end_date: this.date_range_to.el?.value,
          };
        } else if (dataValue === "month" || dataValue === "year" || dataValue === "quarter" ||
                   dataValue === "last-month" || dataValue === "last-year" || dataValue === "last-quarter") {
          // Presets de rango: usar string y limpiar errores
          this.state.date_range = dataValue;
          this.state.dateError = null;
          this.state.exportDisabled = false;
        } else if (dataValue === "journal") {
          const id = parseInt(target.getAttribute("data-id"), 10);
          if (!target.classList.contains("selected-filter")) {
            this.state.selected_journal_list.push(id);
            target.classList.add("selected-filter");
          } else {
            this.state.selected_journal_list = this.state.selected_journal_list.filter((x) => x !== id);
            target.classList.remove("selected-filter");
          }
        } else if (dataValue === "analytic") {
          const id = parseInt(target.getAttribute("data-id"), 10);
          if (!target.classList.contains("selected-filter")) {
            this.state.selected_analytic_list.push(id);
            target.classList.add("selected-filter");
          } else {
            this.state.selected_analytic_list = this.state.selected_analytic_list.filter((x) => x !== id);
            target.classList.remove("selected-filter");
          }
        } else if (dataValue === "draft") {
          if (target.classList.contains("selected-filter")) {
            const { draft, ...rest } = this.state.options || {};
            this.state.options = rest;
            target.classList.remove("selected-filter");
          } else {
            this.state.options = { ...(this.state.options || {}), draft: true };
            target.classList.add("selected-filter");
          }
        } else if (dataValue === "cash-basis") {
          if (target.classList.contains("selected-filter")) {
            // Volver a devengo
            this.state.method = { accrual: true };
            target.classList.remove("selected-filter");
          } else {
            // Pasar a caja
            this.state.method = { cash: true };
            target.classList.add("selected-filter");
          }
        } else if (dataValue === "account") {
          const accountId = parseInt(target.getAttribute("data-id"), 10);
          if (!target.classList.contains("selected-filter")) {
            this.state.selected_account_list.push(accountId);
            target.classList.add("selected-filter");
          } else {
            this.state.selected_account_list = this.state.selected_account_list.filter((x) => x !== accountId);
            target.classList.remove("selected-filter");
          }
        }
        this.state.selected_journal_list  = [...new Set(this.state.selected_journal_list)];
        this.state.selected_analytic_list = [...new Set(this.state.selected_analytic_list)];
        this.state.selected_account_list  = [...new Set(this.state.selected_account_list)];

        // 2) Validación en vivo del rango personalizado (si aplica)
        if (!this.validateDateRange()) { 
          // Aviso y NO llamamos al servidor
          this.notification?.add(this.state.dateError || "Rango de fechas inválido.", { type: "danger" });
          this.render(true);
          return;
        }
        // --- 3) Preparar parámetros con fallbacks seguros ---
        const journal_ids = Array.from(this.state.selected_journal_list || []);
        const date_range  = this.state.date_range || null;      // string preset o {start_date,end_date}
        const options     = this.state.options || {};           // el backend ya interpreta {} → posted
        const analytic    = Array.from(this.state.selected_analytic_list || []);
        const method      = this.state.method || { accrual: true };
        const account_ids = (this.state.selected_account_rec || []).map((a) => a.id);

        // --- 4) Llamada al servidor ---
        const filtered_data = await this.orm.call(
            "account.general.ledger",
            "get_filter_values",
            [journal_ids, date_range, options, analytic, method, account_ids]
        );

        // (Opcional) refrescar catálogos si vienen en la respuesta
        this.state.journals  = filtered_data.journal_ids  || this.state.journals;
        this.state.analytics = filtered_data.analytic_ids || this.state.analytics;
        this.state.accounts  = filtered_data.account_ids  || this.state.accounts;

        // --- 5) Procesar totales y líneas ---
        const account_totals = filtered_data.account_totals || {};
        for (const accTot of Object.values(account_totals)) {
            totalDebitSum  += accTot?.total_debit  || 0;
            totalCreditSum += accTot?.total_credit || 0;
        }

        // Limpiar/normalizar estructura de líneas por cuenta
        const cleaned_account_data = {};
        for (const [key, value] of Object.entries(filtered_data)) {
            if (key === "account_totals" || key === "journal_ids" || key === "analytic_ids" || key === "account_ids") {
                continue;
            }
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
        this.state.currency     = (Object.values(account_totals)[0] || {}).currency_id || "";
        this.state.account      = account_list;
        this.state.account_data = cleaned_account_data;
        this.state.account_total = account_totals;
        this.state.total_debit  = totalDebitSum.toFixed(2);
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
        let startYear, startMonth, startDay, endYear, endMonth, endDay;

        const parseLocal = (s) => {
            if(!s) return null; 
            const [y, m, d] = s.split("-").map(Number);
            return new Date(y, m - 1, d);
        };
        const selectedJournalIDs = Array.from(self.state.selected_journal_list || []); 
        const selectedJournalNames = selectedJournalIDs 
          .map((journalID) =>{
            const j = (self.state.journals || []).find((jj) => jj.id === journalID);
            return j ? j.name : "";
          })
          .filter(Boolean); 
        if (self.state.date_range) {
            const today = new Date();
            if (self.state.date_range === "year") {
                startDate = new Date(today.getFullYear(), 0, 1);
                endDate = new Date(today.getFullYear(), 11, 31);
            } else if (self.state.date_range === "quarter") {
                const currentQuarter = Math.floor(today.getMonth() / 3);
                startDate = new Date(today.getFullYear(), currentQuarter * 3, 1);
                endDate = new Date(today.getFullYear(), (currentQuarter + 1) * 3, 0);
            } else if (self.state.date_range === "month") {
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            } else if (self.state.date_range === "last-month") {
                startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                endDate = new Date(today.getFullYear(), today.getMonth(), 0);
            } else if (self.state.date_range === "last-year") {
                startDate = new Date(today.getFullYear() - 1, 0, 1);
                endDate = new Date(today.getFullYear() - 1, 11, 31);
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
        // Check if start and end dates are available before adding them to the filters object
        if (
            startYear !== undefined &&
            startMonth !== undefined &&
            startDay !== undefined &&
            endYear !== undefined &&
            endMonth !== undefined &&
            endDay !== undefined
        ) {
            filters["start_date"] = `${startYear}-${
                startMonth < 10 ? "0" : ""
            }${startMonth}-${startDay < 10 ? "0" : ""}${startDay}`;
            filters["end_date"] = `${endYear}-${endMonth < 10 ? "0" : ""}${endMonth}-${
                endDay < 10 ? "0" : ""
            }${endDay}`;
        }
        return filters;
    }
}
GeneralLedger.defaultProps = {
    resIds: [],
};
GeneralLedger.template = "gl_template_new";
actionRegistry.add("gen_l", GeneralLedger);
