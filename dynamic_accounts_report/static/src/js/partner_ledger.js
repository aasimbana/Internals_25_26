/** @odoo-module */

const {Component} = owl;
import {registry} from "@web/core/registry";
import {useService} from "@web/core/utils/hooks";
import {useRef, useState} from "@odoo/owl";
import {BlockUI} from "@web/core/ui/block_ui";
import {download} from "@web/core/network/download";
const actionRegistry = registry.category("actions");

class PartnerLedger extends owl.Component {
    setup() {
        super.setup(...arguments);
        this.initial_render = true;
        this.orm = useService("orm");
        this.action = useService("action");
        this.tbody = useRef("tbody");
        this.unfoldButton = useRef("unfoldButton");
        this.dialog = useService("dialog");
        this.fetchPartners();
        this.state = useState({
            partners: null,
            all_partners: [],
            data: null,
            total: null,
            title: null,
            currency: null,
            filter_applied: null,
            selected_partner: [],
            selected_partner_rec: [],
            total_debit: null,
            total_credit: null,
            partner_list: null,
            total_list: null,
            date_range: {start_date: null, end_date: null},
            account: null,
            options: null,
            message_list: [],
        });
        //this.load_data((self.initial_render = true));
    }
    async load_data() {
        /**
         * Loads the data for the partner ledger report.
         */
        let partner_list = [];
        let partner_totals = "";
        let totalDebitSum = 0;
        let totalCreditSum = 0;
        let currency;
        var self = this;
        var action_title = self.props.action.display_name;
        try {
            var self = this;
            self.state.data = await self.orm.call(
                "account.partner.ledger",
                "view_report",
                [[this.wizard_id], action_title]
            );
            // Extract partner information from the data
            $.each(self.state.data, function (index, value) {
                if (index !== "partner_totals") {
                    partner_list.push(index);
                } else {
                    partner_totals = value;
                    Object.values(partner_totals).forEach((partner_list) => {
                        currency = partner_list.currency_id;
                        totalDebitSum += partner_list.total_debit || 0;
                        totalCreditSum += partner_list.total_credit || 0;
                    });
                }
            });
            self.state.partners = partner_list;
            self.state.partner_list = partner_list;
            self.state.total_list = partner_totals;
            self.state.total = partner_totals;
            self.state.currency = currency;
            self.state.total_debit = totalDebitSum;
            self.state.total_credit = totalCreditSum;
            self.state.title = action_title;
        } catch (el) {
            window.location.href;
        }
    }
    async printPdf(ev) {
        /**
         * Generates and displays a PDF report for the partner ledger.
         *
         * @param {Event} ev - The event object triggered by the action.
         * @returns {Promise} - A promise that resolves to the result of the action.
         */
        ev.preventDefault();
        let partner_list = [];
        let partner_value = [];
        let partner_totals = "";
        let totals = {
            total_debit: this.state.total_debit,
            total_credit: this.state.total_credit,
            currency: this.state.currency,
        };
        var action_title = this.props.action.display_name;
        return this.action.doAction({
            type: "ir.actions.report",
            report_type: "qweb-pdf",
            report_name: "dynamic_accounts_report.partner_ledger",
            report_file: "dynamic_accounts_report.partner_ledger",
            data: {
                partners: this.state.partners,
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

        
        updateFilter(ev) {
            const t = ev?.target;
            if (!t) return;
    
           
            const toISO = (s) => {
                if (!s) return null;
                if (s.includes("/")) {
                    const [dd, mm, yyyy] = s.split("/").map(Number);
                    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
                }
                return s; 
            };
    
           
            const computePresetRange = (dv) => {
                const today = new Date();
                const iso = (d) => d.toISOString().slice(0, 10);
                let start = null, end = null;
    
                if (dv === "year") {
                    start = new Date(today.getFullYear(), 0, 1);
                    end   = new Date(today.getFullYear(), 11, 31);
                } else if (dv === "quarter") {
                    const q = Math.floor(today.getMonth() / 3);
                    start = new Date(today.getFullYear(), q * 3, 1);
                    end   = new Date(today.getFullYear(), (q + 1) * 3, 0);
                } else if (dv === "month") {
                    start = new Date(today.getFullYear(), today.getMonth(), 1);
                    end   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                } 
    
                return {
                    start_date: start ? iso(start) : null,
                    end_date:   end   ? iso(end)   : null,
                };
            };
    
            // Inputs manuales
            if (t.name === "start_date") {
                this.state.date_range = {
                    ...this.state.date_range,
                    start_date: toISO(t.value),
                };
                return;
            }
            if (t.name === "end_date") {
                this.state.date_range = {
                    ...this.state.date_range,
                    end_date: toISO(t.value),
                };
                return;
            }
    
            
            const dv = t.getAttribute?.("data-value");
            if (dv) {
                const { start_date, end_date } = computePresetRange(dv);
                if (start_date || end_date) {
                    this.state.date_range = { start_date, end_date }; 
                }
            }
        }
    
    //Funcion que se manda a llamar en el PDF obtiene la informacion
        // ---[REPLACE]--- filter(): solo lee del objeto date_range
        filter() {
            const dr = this.state?.date_range || { start_date: null, end_date: null };
    
            // Validación simple opcional
            if (dr.start_date && dr.end_date && new Date(dr.start_date) > new Date(dr.end_date)) {
                // Si usas flags de UI, puedes marcar error aquí
                // this.state.dateError = true;
            }
    
            return {
                partner: this.state.selected_partner_rec,
                account: this.state.account,
                options: this.state.options,
                start_date: dr.start_date || null,
                end_date: dr.end_date || null,
            };
        }
    
    async print_xlsx() {
        /**
         * Generates and downloads an XLSX report for the partner ledger.
         */
        var self = this;

        let partner_list = [];
        let partner_value = [];
        let partner_totals = "";
        let totals = {
            total_debit: this.state.total_debit,
            total_credit: this.state.total_credit,
            currency: this.state.currency,
        };
        var action_title = self.props.action.display_name;
        var datas = {
            partners: self.state.partners,
            data: self.state.data,
            total: self.state.total,
            title: action_title,
            filters: this.filter(),
            grand_total: totals,
        };
        var action = {
            data: {
                model: "account.partner.ledger",
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
        /**
         * Navigates to the journal entry form view based on the selected event target.
         *
         * @param {Event} ev - The event object triggered by the action.
         * @returns {Promise} - A promise that resolves to the result of the action.
         */
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "account.move",
            res_id: parseInt(ev.target.attributes["data-id"].value, 10),
            views: [[false, "form"]],
            target: "current",
        });
    }
    gotoJournalItem(ev) {
        /**
         * Navigates to the journal items list view based on the selected event target.
         *
         * @param {Event} ev - The event object triggered by the action.
         * @returns {Promise} - A promise that resolves to the result of the action.
         */
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "account.move.line",
            name: "Journal Items",
            views: [[false, "list"]],
            domain: [
                [
                    "partner_id",
                    "=",
                    parseInt(ev.target.attributes["data-id"].value, 10),
                ],
                ["account_type", "in", ["liability_payable", "asset_receivable"]],
            ],
            target: "current",
        });
    }
    openPartner(ev) {
        /**
         * Opens the partner form view based on the selected event target.
         *
         * @param {Event} ev - The event object triggered by the action.
         * @returns {Promise} - A promise that resolves to the result of the action.
         */
        return this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "res.partner",
            res_id: parseInt(ev.target.attributes["data-id"].value, 10),
            views: [[false, "form"]],
            target: "current",
        });
    }

    async applyFilter(val, ev, is_delete = false) {
        let partner_list = []; 
        let partner_value = [];
        let partner_totals = ""; 
        let month = null;
        this.state.partners = null;
        this.state.data = null;
        this.state.total = null;
        this.state.filter_applied = true;
        let totalDebitSum = 0;
        let totalCreditSum = 0;
        //Valida si existe socio y asigna el nombre a this.state.selected_partner
        if (this.state.selected_partner_rec && this.state.selected_partner_rec.id) {
            //console.log("=====INGRESO 1==========")
            this.state.selected_partner = this.state.selected_partner_rec.name;
        } else {
            console.error("El objeto selected_partner_rec no tiene un ID válido.");
        }
        //console.log(val,"=======INGRESO 2========")
        if (val && val.target) {
            // 1) Actualiza SIEMPRE el date_range (inputs y presets)
            this.updateFilter(val);
        
            // 2) Toggles (receivable/payable/draft)
            const dv = val.target.getAttribute?.("data-value");
        
            if (dv === "receivable") {
                if (val.target.classList.contains("selected-filter")) {
                    const { Receivable, ...updatedAccount } = this.state.account || {};
                    this.state.account = updatedAccount;
                    val.target.classList.remove("selected-filter");
                } else {
                    this.state.account = { ...(this.state.account || {}), Receivable: true };
                    val.target.classList.add("selected-filter");
                }
            } else if (dv === "payable") {
                if (val.target.classList.contains("selected-filter")) {
                    const { Payable, ...updatedAccount } = this.state.account || {};
                    this.state.account = updatedAccount;
                    val.target.classList.remove("selected-filter");
                } else {
                    this.state.account = { ...(this.state.account || {}), Payable: true };
                    val.target.classList.add("selected-filter");
                }
            } else if (dv === "draft") {
                if (val.target.classList.contains("selected-filter")) {
                    const { draft, ...updatedOptions } = this.state.options || {};
                    this.state.options = updatedOptions;
                    val.target.classList.remove("selected-filter");
                } else {
                    this.state.options = { ...(this.state.options || {}), draft: true };
                    val.target.classList.add("selected-filter");
                }
            }
        }
        
        //console.log(this.state.date_range,"VALOR FECHA#")
        // Llamada a la base de datos
        const filters = this.filter(); // { partner, account, options, start_date, end_date }
        let filtered_data = await this.orm.call(
            "account.partner.ledger",
            "get_filter_values",
            [
                this.state.selected_partner, // (revisa contrato: id, lista o nombre)
                { start_date: filters.start_date, end_date: filters.end_date }, // SOLO fechas
                this.state.account,
                this.state.options,
            ]
        );


        console.log(filtered_data,"ESTA ES LA DATA")
        // Procesar los datos filtrados
        $.each(filtered_data, function (index, value) {
            if (index !== "partner_totals") {
                partner_list.push(index);
            } else {
                partner_totals = value;
                //console.log(partner_totals,"Partner")
                Object.values(partner_totals).forEach((partner_list) => {
                    totalDebitSum += partner_list.total_debit || 0;
                    totalCreditSum += partner_list.total_credit || 0;
                    if (
                        partner_list.initial_balance !== undefined &&
                        !isNaN(partner_list.initial_balance)
                    ) {
                        totalDebitSum += parseFloat(partner_list.initial_balance);
                        partner_list.total_debit += parseFloat(
                            partner_list.initial_balance
                        );
                    }
                });
            }
        });
        //console.log(this.state,"Valores Finales")
        this.state.partners = partner_list;
        this.state.data = filtered_data;
        this.state.total = partner_totals;
        this.state.total_debit = totalDebitSum;
        this.state.total_credit = totalCreditSum;

        if (this.unfoldButton.el.classList.contains("selected-filter")) {
            this.unfoldButton.el.classList.remove("selected-filter");
        }
    }
    getDomain() {
        return [];
    }

    async fetchPartners() {
        /**
         * Carga todos los clientes y los almacena en el estado.
         */
        let partners = await this.orm.call("res.partner", "search_read", [
            [["supplier_rank", ">", 0]], // Solo proveedores
            ["id", "name"],
        ]);
        partners.unshift({id: null, name: "All"});
        this.state.all_partners = partners;
        //console.log("Hola",this.state.all_partners)
    }

    async updatePartnerList(event) {
        this.state.search = event.target.value.toLowerCase(); // Guardamos el valor de la búsqueda
        if (event.code === "Enter") {
            // Si se presiona Enter
            this._onPressEnterKey();
        } else {
            // Si no es Enter, solo filtra
            this.filterPartners();
        }
    }

    _onPressEnterKey() {
        if (this.state.search) {
            // Si hay algo en el campo de búsqueda
            this.filterPartners(); // Realiza el filtro
        }
    }

    selectPartner(event) {
        //debugger;
        const partnerId = event.target.dataset.value;
        if (partnerId === "null") {
            // Si el usuario selecciona "All", seleccionamos todos los clientes
            this.state.selected_partner_rec = [
                ...this.state.all_partners.filter((p) => p.id !== null),
            ];
            this.load_data((self.initial_render = true));
        } else {
            // Buscar el cliente específico
            const selectedPartner = this.state.all_partners.find(
                (partner) => partner.id == partnerId
            );
            if (selectedPartner) {
                this.state.selected_partner_rec = selectedPartner;
            }
        }
        this.render(true); // Actualizar la vista
    }
    //Filtra los CLientes segun el Valor del Field Cliente
    filterPartners() {
        const searchQuery = this.state.search.toLowerCase(); // Convertimos la búsqueda a minúsculas para no importar el caso
        if (searchQuery) {
            this.state.filteredPartners = this.state.all_partners.filter(
                (partner) =>
                    partner.name && partner.name.toLowerCase().includes(searchQuery) // Filtramos los socios que coincidan con la búsqueda
            );
            this.state.all_partners = this.state.filteredPartners; // Actualizamos la lista con los socios filtrados
        } else {
            this.fetchPartners();
        }
        this.render(true);
    }

    _clearSearch() {
        this.state.all_partners = [...this.state.all_partners]; // Aquí puedes realizar una asignación para recargar todos
    }
    async unfoldAll(ev) {
        /**
         * Unfolds all items in the table body if the event target does not have the 'selected-filter' class,
         * or folds all items if the event target has the 'selected-filter' class.
         *
         * @param {Event} ev - The event object triggered by the action.
         */
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
}
PartnerLedger.defaultProps = {
    resIds: [],
};
PartnerLedger.template = "pl_template_new";
actionRegistry.add("p_l", PartnerLedger);