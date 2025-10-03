/** @odoo-module **/

import { Component, useRef, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { BlockUI } from "@web/core/ui/block_ui";
import { download } from "@web/core/network/download";


const actionRegistry = registry.category("actions");

class GeneralLedger extends Component {
    setup() {
        super.setup(...arguments);
        this.notification = useService("notification");
        this.orm = useService("orm");
        this.action = useService("action");
        this.ui = useService("ui");


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
            date_range: { start_date: null, end_date: null },
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
        const y = today.getFullYear();
        let startDate, endDate;

        if (rangeType === "thisMonth") {
            const m = today.getMonth();
            startDate = new Date(y, m, 1);
            endDate = new Date(y, m + 1, 0);
        } else if (rangeType === "lastMonth") {
            const m = today.getMonth() - 1;
            startDate = new Date(y, m, 1);
            endDate = new Date(y, m + 1, 0);
        } else {
            return;
        }
        const ymd = (d) => {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            return `${yyyy}-${mm}-${dd}`;
        };

        const startStr = ymd(startDate);
        const endStr = ymd(endDate);

        this.state.date_range = { start_date: startStr, end_date: endStr };
        this.state.range_label = `${startStr.slice(8,10)}/${startStr.slice(5,7)}/${startStr.slice(0,4)} - ${endStr.slice(8,10)}/${endStr.slice(5,7)}/${endStr.slice(0,4)}`;

        if (this.date_range_from.el) this.date_range_from.el.value = startStr;
        if (this.date_range_to.el) this.date_range_to.el.value = endStr;
    }

    updateFilter(ev) {
        const t = ev?.target;
        if (!t) return;
        if (!this.state.date_range || typeof this.state.date_range !== "object") {
            this.state.date_range = { start_date: null, end_date: null };
        }
        const normalize = (s) => {
            if (!s) return null;
            if (s.includes("-")) return s; // ISO format
            if (s.includes("/")) {
                const [dd, mm, yyyy] = s.split("/").map(Number);
                return `${yyyy}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
            }
            return s;
        };

        if (t.name === "start_date") {
            this.state.date_range.start_date = normalize(t.value) || null;
        } else if (t.name === "end_date") {
            this.state.date_range.end_date = normalize(t.value) || null;
        } else {
            const dv = t.getAttribute?.("data-value");
            if (dv) {
                this.state.date_range = dv;
                this.state.dateError = null;
                this.state.exportDisabled = false;
            }
        }
        this.render(true);
    }

    validateDateRange() {
        const dr = this.state.date_range;
        if (!dr || typeof dr === "string") {
            this.state.dateError = null;
            this.state.exportDisabled = false;
            return true;
        }
        const { start_date, end_date } = dr || {};

        if (!start_date || !end_date) {
            this.state.dateError = null;
            this.state.exportDisabled = false;
            return true;
        }

        const parseLocal = (s) => {
            if (!s) return null;
            if (s.includes("-")) {
                const [y,m,d] = s.split("-").map(Number);
                return new Date(y,m-1,d);
            }
            if (s.includes("/")) {
                const [d,m,y] = s.split("/").map(Number);
                return new Date(y,m-1,d);
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
        const data = await this.orm.call("account.general.ledger", "view_report", [null, null]);
        this.state.journals = data.journal_ids || [];
        this.state.analytics = data.analytic_ids || [];
        this.state.accounts = data.account_ids || [];
        const base = this.state.accounts.filter(a => a && a.id != null);
        this.state.all_accounts = [{ id: null, name: "ALL" }, ...base];
        this.state.filteredAccounts = [...this.state.all_accounts];
        this.render(true);
    }

    selectAccount(e) {
        const raw = e.currentTarget?.dataset?.value;
        if (raw === "null") {
            this.state.selected_account_rec = [];
        } else {
            const id = Number(raw);
            const sel = this.state.accounts.find(a => a?.id === id || String(a?.id) === raw);
            this.state.selected_account_rec = sel ? [sel] : [];
        }
        if (typeof this.load_data === "function") this.load_data();
        this.render(true);
    }

    async updateAccountList(event) {
        const value = (event?.target?.value || "").toLowerCase().trim();
        this.state.search = value;
        const base = this.state.accounts.filter(a => a && a.id != null);

        if (!value) {
            this.state.filteredAccounts = [{ id:null, name:"ALL" }, ...base];
        } else {
            const filtered = base.filter(acc => {
                const name = (acc.name || "").toLowerCase();
                const code = (acc.code || "").toLowerCase();
                return name.includes(value) || code.includes(value);
            });
            this.state.filteredAccounts = [{ id:null, name:"ALL" }, ...filtered];
        }
        this.render(true);
    }

    _onAccountPressEnterKey() {
        this.updateAccountList({ target: { value: this.state.search || "" } });
    }

    filterAccounts() {
        const value = (this.state.search || "").toLowerCase().trim();
        const base = this.state.accounts.filter(a => a && a.id != null);
        const filtered = value
            ? base.filter(acc =>
                (acc.name || "").toLowerCase().includes(value) ||
                (acc.code || "").toLowerCase().includes(value)
            )
            : base;
        this.state.filteredAccounts = [{ id:null, name:"ALL" }, ...filtered];
        this.render(true);
    }

    async fetchAccounts() {
        const data = await this.orm.call("account.general.ledger", "view_report", [null, null]);
        const base = (data.account_ids || []).filter(a => a && a.id != null);
        this.state.accounts = base;
        this.state.all_accounts = [{ id:null, name:"ALL" }, ...base];
        this.state.filteredAccounts = [...this.state.all_accounts];
        this.render(true);
    }

    async _annotateAnalyticLabels(cleaned_account_data) {
        const alIds = new Set();
        for (const lines of Object.values(cleaned_account_data)) {
            for (const l of lines) {
                (l.analytic_line_ids || []).forEach(id => alIds.add(id));
            }
        }
        if (!alIds.size) return;

        const aLines = await this.orm.read("account.analytic.line", [...alIds], ["account_id"]);

        const aLineToAccName = {};
        for (const r of aLines || []) {
            aLineToAccName[r.id] = (r.account_id && r.account_id[1]) || "";
        }

        for (const lines of Object.values(cleaned_account_data)) {
            for (const l of lines) {
                const names = Array.from(
                    new Set(
                        (l.analytic_line_ids || []).map(id => aLineToAccName[id]).filter(Boolean)
                    )
                );
                l._analytic_label = names.join(", ");
            }
        }
    }

    async printPdf(ev) {
        ev.preventDefault();
        if (this.state.exportDisabled) {
            this.notification.add(this.state.dateError || "Rango de fechas inválido.", { type: "danger" });
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
            report_name: "dynamic_accounts_report.general_ledger",
            report_file: "dynamic_accounts_report.general_ledger",
            data: {

                data: this.state,
                account: this.state.account,
                data: this.state.account_data,
                analytics: this.state.analytics,
                total: this.state.account_total,
                title: action_title,
                filters: this.filter(),
                grand_total: totals,
                report_name: action_title,

            },
           
            display_name: action_title,
        
        });
        
    }

    async print_xlsx() {
        if (this.state.exportDisabled) {
            this.notification.add(this.state.dateError || "Rango de fechas inválido.", { type: "danger" });
            return;
        }
    
        this.ui.block();
        try {
            // 1) Deriva nombres de analíticas (si ya tienes analytics en state)
            const analyticNames = Array.from(this.state.selected_analytic_list || [])
                .map((id) => (this.state.analytics || []).find((a) => a.id === id))
                .filter(Boolean)
                .map((a) => a.name);
    
            const action_title = this.props.action.display_name;
            const totals = {
                total_debit: this.state.total_debit,
                total_credit: this.state.total_credit,
                currency: this.state.currency,
            };
    
            // 2) Incluye analítica en filters y también manda las líneas con _analytic_label si ya las tienes
            const datas = {
                account: this.state.account,
                data: this.state.account_data,
                total: this.state.account_total,
                title: action_title,
                filters: {
                    ...this.filter(),                         // lo que ya mandabas
                    analytic_ids: Array.from(this.state.selected_analytic_list || []),
                    analytic_names: analyticNames,            // <- NUEVO
                },
                grand_total: totals,
                lines: this.state.account_data_list || [],     // <- por si tu xlsx usa las líneas ya anotadas
            };
    
            await download({
                url: "/xlsx_report",
                data: {
                    model: "account.general.ledger",
                    data: JSON.stringify(datas),              // <- ahora el JSON ya lleva analítica y líneas
                    output_format: "xlsx",
                    report_action: this.props.action.xml_id,
                    report_name: action_title,
                    // mantener si tu controlador actual lo usa:
                    lines: this.state.account_data_list || [],
                },
            });
        } finally {
            this.ui.unblock();
        }
    }
    

    gotoJournalEntry(ev) {
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "account.move",
            res_id: parseInt(ev.target.dataset.id, 10),
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
            domain: [["account_id", "=", parseInt(ev.target.dataset.id, 10)]],
            target: "current",
        });
    }

    getDomain() {
        return [];
    }

    async applyFilter() {
        this.state.account = null;
        this.state.account_data = null;
        this.state.account_total = null;
        this.state.filter_applied = true;

        this.state.selected_journal_list = [...new Set(this.state.selected_journal_list)];
        this.state.selected_analytic_list = [...new Set(this.state.selected_analytic_list)];
        this.state.selected_account_list = [...new Set(this.state.selected_account_list)];

        if (typeof this.state.date_range === "object" && !this.validateDateRange()) {
            this.notification.add(this.state.dateError || "Rango de fechas inválido.", { type: "danger" });
            this.render(true);
            return;
        }

        const journal_ids = Array.from(this.state.selected_journal_list || []);
        const rawDR = this.state.date_range || {};
        const isEmptyDateRange = typeof rawDR === "object" && (!rawDR.start_date || rawDR.start_date === "") && (!rawDR.end_date || rawDR.end_date === "");

        const date_range = isEmptyDateRange ? null : rawDR;
        const options = this.state.options || {};
        const analytic = Array.from(this.state.selected_analytic_list || []);
        const method = this.state.method || { accrual: true };
        const account_ids = this.state.selected_account_list.length
            ? [...this.state.selected_account_list]
            : (this.state.selected_account_rec || []).map(a => a.id);

        const filtered_data = await this.orm.call(
            "account.general.ledger",
            "get_filter_values",
            [journal_ids, date_range, options, analytic, method, account_ids]
        );

        this.state.journals = filtered_data.journal_ids || this.state.journals;
        this.state.analytics = filtered_data.analytic_ids || this.state.analytics;
        this.state.accounts = filtered_data.account_ids || this.state.accounts;

        const base = this.state.accounts.filter(a => a && a.id != null);
        this.state.all_accounts = [{ id: null, name: "ALL" }, ...base];
        this.state.filteredAccounts = [{ id: null, name: "ALL" }, ...base];

        let totalDebitSum = 0;
        let totalCreditSum = 0;
        const account_totals = filtered_data.account_totals || {};
        for (const accTot of Object.values(account_totals)) {
            totalDebitSum += accTot?.total_debit || 0;
            totalCreditSum += accTot?.total_credit || 0;
        }

        const cleaned_account_data = {};
        const account_list = [];
        for (const [key, value] of Object.entries(filtered_data)) {
            if (["account_totals", "journal_ids", "analytic_ids", "account_ids"].includes(key)) continue;
            account_list.push(key);
            if (Array.isArray(value) && value.length) {
                const flat = value.flat();
                cleaned_account_data[key] = flat.map(v => (Array.isArray(v) ? v[0] : v));
            } else {
                cleaned_account_data[key] = [];
            }
        }

        await this._annotateAnalyticLabels(cleaned_account_data);

        this.state.currency = (Object.values(account_totals)[0] || {}).currency_id || "";
        this.state.account = [...new Set(account_list)];
        this.state.account_data = cleaned_account_data;
        this.state.account_total = account_totals;
        this.state.total_debit = totalDebitSum.toFixed(2);
        this.state.total_credit = totalCreditSum.toFixed(2);

        if (this.unfoldButton.el?.classList?.contains("selected-filter")) {
            this.unfoldButton.el.classList.remove("selected-filter");
        }
        this.render(true);
    }

    async unfoldAll(ev) {
        if (!ev.target.classList.contains("selected-filter")) {
            for (const child of this.tbody.el.children) {
                child.classList.add("show");
            }
            ev.target.classList.add("selected-filter");
        } else {
            for (const child of this.tbody.el.children) {
                child.classList.remove("show");
            }
            ev.target.classList.remove("selected-filter");
        }
    }

    filter() {
        const pad = n => String(n).padStart(2, "0");
        const parseLocal = s => {
            if (!s) return null;
            if (s.includes("-")) {
                const [y,m,d] = s.split("-").map(Number);
                return new Date(y,m-1,d);
            }
            if (s.includes("/")) {
                const [d,m,y] = s.split("/").map(Number);
                return new Date(y,m-1,d);
            }
            return new Date(s);
        };

        const selectedJournalIDs = Array.from(this.state.selected_journal_list || []);
        const selectedJournalNames = selectedJournalIDs
            .map(journalID => {
                const j = (this.state.journals || []).find(jj => jj.id === journalID);
                return j ? j.name : "";
            })
            .filter(Boolean);

        let startDate, endDate;
        if (this.state.date_range) {
            const today = new Date();
            if (this.state.date_range === "quarter") {
                const currentQuarter = Math.floor(today.getMonth() / 3);
                startDate = new Date(today.getFullYear(), currentQuarter * 3, 1);
                endDate = new Date(today.getFullYear(), (currentQuarter + 1) * 3, 0);
            } else if (this.state.date_range === "month") {
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            } else if (this.state.date_range === "last-month") {
                startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                endDate = new Date(today.getFullYear(), today.getMonth(), 0);
            } else if (this.state.date_range === "last-quarter") {
                const lastQuarter = Math.floor((today.getMonth() - 3) / 3);
                startDate = new Date(today.getFullYear(), lastQuarter * 3, 1);
                endDate = new Date(today.getFullYear(), (lastQuarter + 1) * 3, 0);
            } else {
                startDate = this.state.date_range.start_date ? parseLocal(this.state.date_range.start_date) : null;
                endDate = this.state.date_range.end_date ? parseLocal(this.state.date_range.end_date) : null;
            }
        }

        const padDate = date => ({
            year: date.getFullYear(),
            month: pad(date.getMonth() + 1),
            day: pad(date.getDate()),
        });

        let filters = {
            journal: selectedJournalNames,
            analytic: Array.from(this.state.selected_analytic_list || []).map(id => {
                const analytic = (this.state.analytics || []).find(a => a.id === id);
                return analytic ? analytic.name : "";
            }).filter(Boolean),
            account: this.state.selected_account_rec,
            options: this.state.options,
            start_date: null,
            end_date: null,
        };

        if (startDate && endDate) {
            const s = padDate(startDate);
            const e = padDate(endDate);
            filters.start_date = `${s.day}/${s.month}/${s.year}`;
            filters.end_date = `${e.day}/${e.month}/${e.year}`;
        }
        return filters;
    }
}

GeneralLedger.defaultProps = {
    resIds: [],
};

GeneralLedger.template = "gl_template_new";

actionRegistry.add("gen_l", GeneralLedger);
