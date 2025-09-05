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
            journals: null,
            selected_journal_list: [],
            analytics: null,
            selected_analytic_list: [],
            title: null,
            filter_applied: null,
            account_list: null,
            account_total_list: null,
            accounts: [], // Nuevo estado para cuentas contables
            selected_account_list: [], // Para almacenar cuentas seleccionadas
            date_range: null,
            options: null,             // Todas las cuentas
            filteredAccounts: [],       // Cuentas filtradas
            selected_account_rec: [],     // Cuenta seleccionada
            all_accounts: [],
            search: '',   
            method: {
                accural: true,
            },
        });
        this.loadInitialOptions();
        //this.load_data((self.initial_render = true));
    }
    async loadInitialOptions() {
        const data = await this.orm.call(
            "account.general.ledger",
            "view_report",
            [null, null]
        );
        this.state.journals = data.journal_ids;
        this.state.analytics = data.analytic_ids;
        this.state.all_accounts = data.account_ids || [];
        this.state.filteredAccounts = [...this.state.all_accounts];
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
        this.state.accounts = data;
        this.state.filteredAccounts = [...this.state.all_accounts];
        this.render(true);
    }
    async printPdf(ev) {
        ev.preventDefault();
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
        let account_list = [];
        let account_totals = "";
        let totalDebitSum = 0;
        let totalCreditSum = 0;
        this.state.account = null;
        this.state.account_data = null;
        this.state.account_total = null;
        this.state.filter_applied = true;
            if (this.date_range_from.el.name === "start_date") {
                this.state.date_range = {
                    ...this.state.date_range,
                    start_date: this.date_range_from.el.value,
                };
            }else if (this.date_range_to.el.name === "end_date") {
                this.state.date_range = {
                    ...this.state.date_range,
                    end_date: this.date_range_to.el.value,
                };
            } else if (val.target.attributes["data-value"].value == "month") {
                this.state.date_range = val.target.attributes["data-value"].value;
            } else if (val.target.attributes["data-value"].value == "year") {
                this.state.date_range = val.target.attributes["data-value"].value;
            } else if (val.target.attributes["data-value"].value == "quarter") {
                this.state.date_range = val.target.attributes["data-value"].value;
            } else if (val.target.attributes["data-value"].value == "last-month") {
                this.state.date_range = val.target.attributes["data-value"].value;
            } else if (val.target.attributes["data-value"].value == "last-year") {
                this.state.date_range = val.target.attributes["data-value"].value;
            } else if (val.target.attributes["data-value"].value == "last-quarter") {
                this.state.date_range = val.target.attributes["data-value"].value;
            } else if (val.target.attributes["data-value"].value == "journal") {
                if (!val.target.classList.contains("selected-filter")) {
                    this.state.selected_journal_list.push(
                        parseInt(val.target.attributes["data-id"].value, 10)
                    );
                    val.target.classList.add("selected-filter");
                } else {
                    const updatedList = this.state.selected_journal_list.filter(
                        (item) =>
                            item !==
                            parseInt(val.target.attributes["data-id"].value, 10)
                    );
                    this.state.selected_journal_list = updatedList;
                    val.target.classList.remove("selected-filter");
                }
            } else if (val.target.attributes["data-value"].value == "analytic") {
                if (!val.target.classList.contains("selected-filter")) {
                    this.state.selected_analytic_list.push(
                        parseInt(val.target.attributes["data-id"].value, 10)
                    );
                    val.target.classList.add("selected-filter");
                } else {
                    const updatedList = this.state.selected_analytic_list.filter(
                        (item) =>
                            item !==
                            parseInt(val.target.attributes["data-id"].value, 10)
                    );
                    this.state.selected_analytic_list = updatedList;
                    val.target.classList.remove("selected-filter");
                }
            } else if (val.target.attributes["data-value"].value == "journal") {
                if (!val.target.classList.contains("selected-filter")) {
                    this.state.selected_journal_list.push(
                        parseInt(val.target.attributes["data-id"].value, 10)
                    );
                    val.target.classList.add("selected-filter");
                } else {
                    const updatedList = this.state.selected_journal_list.filter(
                        (item) =>
                            item !==
                            parseInt(val.target.attributes["data-id"].value, 10)
                    );
                    this.state.selected_journal_list = updatedList;
                    val.target.classList.remove("selected-filter");
                }
            } else if (val.target.attributes["data-value"].value == "analytic") {
                if (!val.target.classList.contains("selected-filter")) {
                    this.state.selected_analytic_list.push(
                        parseInt(val.target.attributes["data-id"].value, 10)
                    );
                    val.target.classList.add("selected-filter");
                } else {
                    const updatedList = this.state.selected_analytic_list.filter(
                        (item) =>
                            item !==
                            parseInt(val.target.attributes["data-id"].value, 10)
                    );
                    this.state.selected_analytic_list = updatedList;
                    val.target.classList.remove("selected-filter");
                }
            } else if (val.target.attributes["data-value"].value === "draft") {
                if (val.target.classList.contains("selected-filter")) {
                    const {draft, ...updatedAccount} = this.state.options;
                    this.state.options = updatedAccount;
                    val.target.classList.remove("selected-filter");
                } else {
                    this.state.options = {
                        ...this.state.options,
                        draft: true,
                    };
                    val.target.classList.add("selected-filter");
                }
            } else if (val.target.attributes["data-value"].value === "cash-basis") {
                if (val.target.classList.contains("selected-filter")) {
                    const {cash, ...updatedAccount} = this.state.method;
                    this.state.method = updatedAccount;
                    this.state.method = {
                        ...this.state.method,
                        accrual: true,
                    };
                    val.target.classList.remove("selected-filter");
                } else {
                    const {accrual, ...updatedAccount} = this.state.method;
                    this.state.method = updatedAccount;
                    this.state.method = {
                        ...this.state.method,
                        cash: true,
                    };
                    val.target.classList.add("selected-filter");
                }
            } else if (val.target.attributes["data-value"].value == "account") {
                const accountId = parseInt(val.target.attributes["data-id"].value, 10);
                if (!val.target.classList.contains("selected-filter")) {
                    this.state.selected_account_list.push(accountId);
                    val.target.classList.add("selected-filter");
                } else {
                    const updatedList = this.state.selected_account_list.filter(
                        (item) => item !== accountId
                    );
                    this.state.selected_account_list = updatedList;
                    val.target.classList.remove("selected-filter");
                }
            }

        const selectedAccountIds = this.state.selected_account_rec.length > 0 
            ? [this.state.selected_account_rec[0].id] 
            : [];
        let filtered_data = await this.orm.call(
            "account.general.ledger",
            "get_filter_values",
            [
                this.state.selected_journal_list,
                this.state.date_range,
                this.state.options,
                this.state.selected_analytic_list,
                this.state.method,
                this.state.selected_account_rec.map(acc => acc.id) 
            ]
        );
        $.each(filtered_data, function (index, value) {
            if (
                index !== "account_totals" &&
                index !== "journal_ids" &&
                index !== "analytic_ids" &&
                index !== "account_ids"
            ) {
                account_list.push(index);
            } else {
                account_totals = value;
                Object.values(account_totals).forEach((account_list) => {
                    totalDebitSum += account_list.total_debit || 0;
                    totalCreditSum += account_list.total_credit || 0;
                });
            }
        });
        let cleaned_account_data = {};
        for (const [key, value] of Object.entries(filtered_data)) {
          // Ignora claves que NO son cuentas
          if (key === "account_totals" || key === "journal_ids" || key === "analytic_ids" || key === "account_ids") {
            continue;
          }
        
          // Normaliza la estructura a una lista PLANA de diccionarios [{...}, {...}, ...]
          if (Array.isArray(value) && value.length) {
            // value puede venir como [{...}], [[{...}]], o mezcla
            const flat = value.flat(); // aplana un nivel si viniera anidado
            cleaned_account_data[key] = flat.map(v => (Array.isArray(v) ? v[0] : v));
          } else {
            cleaned_account_data[key] = [];
          }
        account_list = [...new Set(account_list)];
        this.state.currency = (Object.values(account_totals)[0] || {}).currency_id || '';
        }        
        debugger;
        console.log(this.state.selected_account_list);
        this.state.account = account_list;
        this.state.account_data = cleaned_account_data;
        this.state.account_total = account_totals;
        this.state.accounts = filtered_data.account_ids || [];
        this.state.total_debit = totalDebitSum.toFixed(2);
        this.state.total_credit = totalCreditSum.toFixed(2);
        if ($(this.unfoldButton.el.classList).find("selected-filter")) {
            this.unfoldButton.el.classList.remove("selected-filter");
        }
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
                startDate = new Date(self.state.date_range.start_date);
                endDate = new Date(self.state.date_range.end_date);
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
        const selectedJournalIDs = Object.values(self.state.selected_journal_list);
        const selectedJournalNames = selectedJournalIDs.map((journalID) => {
            const journal = self.state.journals.find(
                (journal) => journal.id === journalID
            );
            return journal ? journal.name : "";
        });
        const selectedAnalyticIDs = Object.values(self.state.selected_analytic_list);
        const selectedAnalyticNames = selectedAnalyticIDs.map((analyticID) => {
            const analytic = self.state.analytics.find(
                (analytic) => analytic.id === analyticID
            );
            return analytic ? analytic.name : "";
        });
        let filters = {
            journal: selectedJournalNames,
            analytic: selectedAnalyticNames,
            account: self.state.selected_analytic_account_rec,
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
