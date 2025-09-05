/** @odoo-module */

const {Component} = owl;
import {registry} from "@web/core/registry";
import {useService} from "@web/core/utils/hooks";
import {useRef, useState} from "@odoo/owl";
import {BlockUI} from "@web/core/ui/block_ui";
import {download} from "@web/core/network/download";
const actionRegistry = registry.category("actions");
const today = luxon.DateTime.now();

class AgedReceivable extends owl.Component {
    async setup() {
        super.setup(...arguments);
        this.initial_render = true;
        this.orm = useService("orm");
        this.action = useService("action");
        this.tbody = useRef("tbody");
        this.date_range = useRef("date_to");
        this.unfoldButton = useRef("unfoldButton");
        this.fetchPartners();
        this.state = useState({
            move_line: null,
            data: null,
            total: null,
            currency: null,
            total_debit: null,
            diff0_sum: null,
            diff1_sum: null,
            diff2_sum: null,
            diff3_sum: null,
            diff4_sum: null,
            diff5_sum: null,
            selected_partner: [],
            selected_partner_rec: [],
            all_partners: [],
            search: "",
            filteredPartners: [],
        });
        await this.fetchPartners();
        // await this.applyFilter();
    }
    async load_data() {
        /**
         * Loads the data for the bank book report.
         */
        let move_line_list = [];
        let move_lines_total = "";
        let diff0Sum = 0;
        let diff1Sum = 0;
        let diff2Sum = 0;
        let diff3Sum = 0;
        let diff4Sum = 0;
        let diff5Sum = 0;
        let TotalDebit = 0;
        let currency;
        var self = this;
        var action_title = self.props.action.display_name;
        try {
            var self = this;
            const selectedPartnerId =
                this.state.selected_partner_rec.length > 0
                    ? this.state.selected_partner_rec[0].id
                    : null; // Si no hay cliente seleccionado, se envía null
            self.state.data = await self.orm.call(
                "age.receivable.report",
                "view_report",
                [selectedPartnerId]
            );
            for (const index in self.state.data) {
                const value = self.state.data[index];
                if (index !== "partner_totals") {
                    move_line_list.push(index);
                } else {
                    move_lines_total = value;
                    for (const moveLine of Object.values(move_lines_total)) {
                        currency = moveLine.currency_id;
                        diff0Sum += moveLine.diff0_sum || 0;
                        diff1Sum += moveLine.diff1_sum || 0;
                        diff2Sum += moveLine.diff2_sum || 0;
                        diff3Sum += moveLine.diff3_sum || 0;
                        diff4Sum += moveLine.diff4_sum || 0;
                        diff5Sum += moveLine.diff5_sum || 0;
                        TotalDebit += moveLine.debit_sum || 0;
                    }
                }
            }
            TotalDebit = parseFloat(TotalDebit.toFixed(2));
            diff0Sum = parseFloat(diff0Sum.toFixed(2));
            diff1Sum = parseFloat(diff1Sum.toFixed(2));
            diff2Sum = parseFloat(diff2Sum.toFixed(2));
            diff3Sum = parseFloat(diff3Sum.toFixed(2));
            diff4Sum = parseFloat(diff4Sum.toFixed(2));
            diff5Sum = parseFloat(diff5Sum.toFixed(2));
            self.state.move_line = move_line_list;
            self.state.total = move_lines_total;
            self.state.currency = currency;
            self.state.total_debit = TotalDebit;
            self.state.diff0_sum = diff0Sum;
            self.state.diff1_sum = diff1Sum;
            self.state.diff2_sum = diff2Sum;
            self.state.diff3_sum = diff3Sum;
            self.state.diff4_sum = diff4Sum;
            self.state.diff5_sum = diff5Sum;
        } catch (el) {
            window.location.href;
        }
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
                ["account_type", "in", ["asset_receivable"]],
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
    async fetchPartners() {
        /**
         * Carga todos los clientes y los almacena en el estado.
         */
        let partners = await this.orm.call("res.partner", "search_read", [
            [["customer_rank", ">", 0]],
            ["id", "name"],
        ]);
        partners.unshift({id: null, name: "All"});
        this.state.all_partners = partners;
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
        const partnerId = event.target.dataset.value;
        if (partnerId === "null") {
            // Si el usuario selecciona "All", seleccionamos todos los clientes
            // this.state.selected_partner_rec = [
            //     ...this.state.all_partners.filter((p) => p.id !== null),
            // ];
            this.state.selected_partner_rec = [];
            this.load_data(); // Llama a load_data para cargar todos los clientes
        } else {
            // Buscar el cliente específico
            const selectedPartner = this.state.all_partners.find(
                (partner) => partner.id == partnerId
            );
            if (selectedPartner) {
                this.state.selected_partner_rec = [selectedPartner]; // Actualiza el estado con el cliente seleccionado
                // this.load_data();
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
    async printPdf(ev) {
        /**
         * Generates and displays a PDF report for the partner ledger.
         *
         * @param {Event} ev - The event object triggered by the action.
         * @returns {Promise} - A promise that resolves to the result of the action.
         */
        ev.preventDefault();
        var self = this;
        var action_title = self.props.action.display_name;
        let totals = {
            diff0_sum: this.state.diff0_sum,
            diff1_sum: this.state.diff1_sum,
            diff2_sum: this.state.diff2_sum,
            diff3_sum: this.state.diff3_sum,
            diff4_sum: this.state.diff4_sum,
            diff5_sum: this.state.diff5_sum,
            total_debit: this.state.total_debit,
            currency: this.state.currency,
        };
        return self.action.doAction({
            type: "ir.actions.report",
            report_type: "qweb-pdf",
            report_name: "dynamic_accounts_report.aged_receivable",
            report_file: "dynamic_accounts_report.aged_receivable",
            data: {
                move_lines: self.state.move_line,
                data: self.state.data,
                total: self.state.total,
                filters: this.filter(),
                grand_total: totals,
                title: action_title,
                report_name: self.props.action.display_name,
            },
            display_name: self.props.action.display_name,
        });
    }
    filter() {
        return {
            partner: this.state.selected_partner_rec,
            end_date: this.date_range.el ? this.date_range.el.value : null,
        };
    }
    async print_xlsx() {
        /**
         * Generates and downloads an XLSX report for the partner ledger.
         */
        var self = this;
        var action_title = self.props.action.display_name;
        let totals = {
            diff0_sum: this.state.diff0_sum,
            diff1_sum: this.state.diff1_sum,
            diff2_sum: this.state.diff2_sum,
            diff3_sum: this.state.diff3_sum,
            diff4_sum: this.state.diff4_sum,
            diff5_sum: this.state.diff5_sum,
            total_debit: this.state.total_debit,
        };
        var datas = {
            move_lines: self.state.move_line,
            data: self.state.data,
            total: self.state.total,
            filters: this.filter(),
            grand_total: totals,
            title: action_title,
        };
        var action = {
            data: {
                model: "age.receivable.report",
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

    async applyFilter(ev) {
        // Limpia los datos anteriores
        this.state.move_line = null;
        this.state.data = null;
        this.state.total = null;

        // Obtiene los valores actuales de los filtros
        const filters = this.filter();

        // Llama a la función para cargar datos con los filtros actuales
        await this.loadFilteredData(filters);

        // Forza la actualización de la vista
        this.render(true);
    }

    async loadFilteredData(filters) {
        let move_line_list = [];
        let move_lines_total = "";
        let diff0Sum = 0;
        let diff1Sum = 0;
        let diff2Sum = 0;
        let diff3Sum = 0;
        let diff4Sum = 0;
        let diff5Sum = 0;
        let TotalDebit = 0;
        let currency;

        try {
            // Obtiene los datos filtrados del servidor
            const filtered_data = await this.orm.call(
                "age.receivable.report",
                "get_filter_values",
                [filters.end_date, filters.partner]
            );

            // Procesa los datos recibidos
            for (const index in filtered_data) {
                const value = filtered_data[index];
                if (index !== "partner_totals") {
                    move_line_list.push(index);
                } else {
                    move_lines_total = value;
                    for (const moveLine of Object.values(move_lines_total)) {
                        currency = moveLine.currency_id;
                        diff0Sum += moveLine.diff0_sum || 0;
                        diff1Sum += moveLine.diff1_sum || 0;
                        diff2Sum += moveLine.diff2_sum || 0;
                        diff3Sum += moveLine.diff3_sum || 0;
                        diff4Sum += moveLine.diff4_sum || 0;
                        diff5Sum += moveLine.diff5_sum || 0;
                        TotalDebit += moveLine.debit_sum || 0;
                    }
                }
            }

            // Actualiza el estado con los nuevos datos
            this.state.data = filtered_data;
            this.state.move_line = move_line_list;
            this.state.total = move_lines_total;
            this.state.currency = currency;
            this.state.total_debit = parseFloat(TotalDebit.toFixed(2));
            this.state.diff0_sum = parseFloat(diff0Sum.toFixed(2));
            this.state.diff1_sum = parseFloat(diff1Sum.toFixed(2));
            this.state.diff2_sum = parseFloat(diff2Sum.toFixed(2));
            this.state.diff3_sum = parseFloat(diff3Sum.toFixed(2));
            this.state.diff4_sum = parseFloat(diff4Sum.toFixed(2));
            this.state.diff5_sum = parseFloat(diff5Sum.toFixed(2));
        } catch (error) {
            console.error("Error al aplicar filtros:", error);
        }
    }

    getDomain() {
        return [];
    }
}
AgedReceivable.template = "age_r_template_new";
AgedReceivable.defaultProps = {
    resIds: [],
};
actionRegistry.add("age_r", AgedReceivable);
