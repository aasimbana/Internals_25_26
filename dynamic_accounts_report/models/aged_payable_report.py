import io
import json

import xlsxwriter

from odoo import api, fields, models


class AgePayableReport(models.TransientModel):
    """For creating Age Payable report"""

    _name = "age.payable.report"
    _description = "Aged Payable Report"

    @api.model
    def view_report(self, partner_id=None):
        """
        Generate a report with move line data categorized by partner and residual
        amount difference.
        """
        partner_total = {}
        move_line_list = {}
        domain = [
            ("parent_state", "=", "posted"),
            ("account_type", "=", "liability_payable"),
            ("reconciled", "=", False),
        ]

        # Si se proporciona un partner_id, añádelo al dominio
        if partner_id:
            domain.append(("partner_id", "=", partner_id))

        # Busca las líneas de movimiento que cumplen con el dominio
        paid = self.env["account.move.line"].search(domain)
        currency_id = self.env.company.currency_id.symbol

        # Obtener los partners únicos de las líneas filtradas
        partner_ids = paid.mapped("partner_id")

        today = fields.Date.today()

        for partner in partner_ids:
            # Filtrar las líneas para el partner actual
            move_line_ids = paid.filtered(lambda rec: rec.partner_id == partner)
            move_line_data = []

            for line in move_line_ids:
                diffrence = (
                    (today - line.date_maturity).days if line.date_maturity else 0
                )
                line_data = {
                    "name": line.name,
                    "move_name": line.move_name,
                    "date": line.date,
                    "amount_currency": line.amount_currency,
                    "account_id": (line.account_id.id, line.account_id.name),  # ← Tupla
                    "date_maturity": line.date_maturity,
                    "currency_id": (line.currency_id.id, line.currency_id.name),  # ← Tupla
                    "amount_residual": -(line.amount_residual),
                    "move_id": (line.move_id.id, line.move_id.name),  # ← Cambiar a tupla
                    "diff0": line.amount_residual if diffrence <= 0 else 0.0,
                    "diff1": line.amount_residual if 0 < diffrence <= 30 else 0.0,
                    "diff2": line.amount_residual if 30 < diffrence <= 60 else 0.0,
                    "diff3": line.amount_residual if 60 < diffrence <= 90 else 0.0,
                    "diff4": line.amount_residual if 90 < diffrence <= 120 else 0.0,
                    "diff5": line.amount_residual if diffrence > 120 else 0.0,
                }
                move_line_data.append(line_data)

            move_line_list[partner.name] = move_line_data
            partner_total[partner.name] = {
                "amount_residual_sum": round(
                    sum(val["amount_residual"] for val in move_line_data), 2
                ),
                "diff0_sum": round(sum(val["diff0"] for val in move_line_data), 2),
                "diff1_sum": round(sum(val["diff1"] for val in move_line_data), 2),
                "diff2_sum": round(sum(val["diff2"] for val in move_line_data), 2),
                "diff3_sum": round(sum(val["diff3"] for val in move_line_data), 2),
                "diff4_sum": round(sum(val["diff4"] for val in move_line_data), 2),
                "diff5_sum": round(sum(val["diff5"] for val in move_line_data), 2),
                "currency_id": currency_id,
                "partner_id": partner.id,
            }

        move_line_list["partner_totals"] = partner_total
        return move_line_list

    @api.model
    def get_filter_values(self, date, partner):
        """
        Retrieve filtered move line data based on date and partner(s).
        Parameters:
            date (str): Date for filtering move lines (format: 'YYYY-MM-DD').
            partner (list): List of partner IDs to filter move lines for.
        Returns:
            dict: Dictionary with filtered move line data organized by partner
                names. Includes amount_residual categorization based on days
                difference. Contains partner-wise summary under
                'partner_totals' key.
        """
        partner_total = {}
        move_line_list = {}
        domain = [
            ("parent_state", "=", "posted"),
            ("account_type", "=", "liability_payable"),
            ("reconciled", "=", False),
        ]
        # Añadir filtro de fecha si está presente
        if date:
            domain.append(("date", "<=", date))

        # Extraer ID del partner correctamente
        partner_ids = []
        if isinstance(partner, list):
            partner_ids = [
                p["id"] for p in partner if isinstance(p, dict) and "id" in p
            ]

        # Añadir filtro de partner si está presente
        if partner_ids:
            domain.append(("partner_id", "in", partner_ids))

        # Buscar las líneas de movimiento que cumplen con el dominio
        paid = self.env["account.move.line"].search(domain)

        currency_id = self.env.company.currency_id.symbol

        partner_ids = paid.mapped("partner_id")
        today = fields.Date.today()

        for partner_id in partner_ids:
            move_line_ids = paid.filtered(lambda rec: rec.partner_id in partner_id)
            move_line_data = []

            for line in move_line_ids:
                diffrence = (
                    (today - line.date_maturity).days if line.date_maturity else 0
                )
                line_data = {
                    "name": line.name,
                    "move_name": line.move_name,
                    "date": line.date,
                    "amount_currency": line.amount_currency,
                    "account_id": line.account_id.name,  # ← CAMBIO: usar .name en vez de .display_name
                    "date_maturity": line.date_maturity,
                    "currency_id": line.currency_id.name,
                    "amount_residual": -(line.amount_residual),
                    "move_id": (line.move_id.id, line.move_id.name),
                    "diff0": line.amount_residual if diffrence <= 0 else 0.0,
                    "diff1": line.amount_residual if 0 < diffrence <= 30 else 0.0,
                    "diff2": line.amount_residual if 30 < diffrence <= 60 else 0.0,
                    "diff3": line.amount_residual if 60 < diffrence <= 90 else 0.0,
                    "diff4": line.amount_residual if 90 < diffrence <= 120 else 0.0,
                    "diff5": line.amount_residual if diffrence > 120 else 0.0,
                }
                move_line_data.append(line_data)

            move_line_list[partner_id.name] = move_line_data
            partner_total[partner_id.name] = {
                "amount_residual_sum": round(
                    sum(val["amount_residual"] for val in move_line_data), 2
                ),
                "diff0_sum": round(sum(val["diff0"] for val in move_line_data), 2),
                "diff1_sum": round(sum(val["diff1"] for val in move_line_data), 2),
                "diff2_sum": round(sum(val["diff2"] for val in move_line_data), 2),
                "diff3_sum": round(sum(val["diff3"] for val in move_line_data), 2),
                "diff4_sum": round(sum(val["diff4"] for val in move_line_data), 2),
                "diff5_sum": round(sum(val["diff5"] for val in move_line_data), 2),
                "currency_id": currency_id,
                "partner_id": partner_id.id,
            }

        move_line_list["partner_totals"] = partner_total
        return move_line_list

    @api.model
    def get_xlsx_report(self, data, response, report_name, report_action):
        """
        Generate an Excel report based on the provided data.
        :param data: The data used to generate the report.
        :type data: str (JSON format)
        :param response: The response object to write the report to.
        :type response: object
        :param report_name: The name of the report.
        :type report_name: str
        :return: None
        """
        data = json.loads(data)
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {"in_memory": True})
        end_date = data["filters"]["end_date"] if data["filters"]["end_date"] else ""
        sheet = workbook.add_worksheet()
        head = workbook.add_format(
            {"align": "center", "bold": True, "font_size": "15px"}
        )
        sub_heading = workbook.add_format(
            {
                "align": "center",
                "bold": True,
                "font_size": "10px",
                "border": 1,
                "bg_color": "#D3D3D3",
                "border_color": "black",
            }
        )
        filter_head = workbook.add_format(
            {
                "align": "center",
                "bold": True,
                "font_size": "10px",
                "border": 1,
                "bg_color": "#D3D3D3",
                "border_color": "black",
            }
        )
        filter_body = workbook.add_format(
            {"align": "center", "bold": True, "font_size": "10px"}
        )
        side_heading_sub = workbook.add_format(
            {
                "align": "left",
                "bold": True,
                "font_size": "10px",
                "border": 1,
                "border_color": "black",
            }
        )
        side_heading_sub.set_indent(1)
        txt_name = workbook.add_format({"font_size": "10px", "border": 1})
        txt_name.set_indent(2)
        sheet.set_column(0, 0, 30)
        sheet.set_column(1, 1, 20)
        sheet.set_column(2, 2, 15)
        sheet.set_column(3, 3, 15)
        col = 0
        sheet.write("A1:b1", report_name, head)
        sheet.write("B3:b4", "Date Range", filter_head)
        sheet.write("B4:b4", "Partners", filter_head)
        if end_date:
            sheet.merge_range("C3:G3", f"{end_date}", filter_body)
        if data["filters"]["partner"]:
            display_names = [
                partner.get("name", "undefined") # ← CAMBIO: usar .name en vez de .display_name
                for partner in data["filters"]["partner"] 
            ]
            display_names_str = ", ".join(display_names)
            sheet.merge_range("C4:G4", display_names_str, filter_body)
        if data:
            if report_action == "dynamic_accounts_report.action_aged_payable":
                sheet.write(6, col, " ", sub_heading)
                sheet.write(6, col + 1, "Fecha Factura", sub_heading)
                sheet.write(6, col + 2, "Importe Moneda", sub_heading)
                sheet.write(6, col + 3, "Moneda", sub_heading)
                sheet.merge_range(6, col + 4, 6, col + 5, "Cuenta", sub_heading)
                sheet.merge_range(6, col + 6, 6, col + 7, "Fecha Prevista", sub_heading)
                sheet.write(6, col + 8, "A Fecha", sub_heading)
                sheet.write(6, col + 9, "1-30", sub_heading)
                sheet.write(6, col + 10, "31-60", sub_heading)
                sheet.write(6, col + 11, "61-90", sub_heading)
                sheet.write(6, col + 12, "91-120", sub_heading)
                sheet.write(6, col + 13, "+Antiguo", sub_heading)
                sheet.write(6, col + 14, "Total", sub_heading)
                row = 6
                for move_line in data["move_lines"]:
                    row += 1
                    sheet.write(row, col, move_line, txt_name)
                    sheet.write(row, col + 1, " ", txt_name)
                    sheet.write(row, col + 2, " ", txt_name)
                    sheet.write(row, col + 3, " ", txt_name)
                    sheet.merge_range(row, col + 4, row, col + 5, " ", txt_name)
                    sheet.merge_range(row, col + 6, row, col + 7, " ", txt_name)
                    sheet.write(
                        row, col + 8, data["total"][move_line]["diff0_sum"], txt_name
                    )
                    sheet.write(
                        row, col + 9, data["total"][move_line]["diff1_sum"], txt_name
                    )
                    sheet.write(
                        row, col + 10, data["total"][move_line]["diff2_sum"], txt_name
                    )
                    sheet.write(
                        row, col + 11, data["total"][move_line]["diff3_sum"], txt_name
                    )
                    sheet.write(
                        row, col + 12, data["total"][move_line]["diff4_sum"], txt_name
                    )
                    sheet.write(
                        row, col + 13, data["total"][move_line]["diff5_sum"], txt_name
                    )
                    sheet.write(
                        row,
                        col + 14,
                        data["total"][move_line]["amount_residual_sum"],
                        txt_name,
                    )
                    for rec in data["data"][move_line]:
                        row += 1
                        sheet.write(row, col, rec["move_name"], txt_name)
                        sheet.write(row, col + 1, rec["date"], txt_name)
                        sheet.write(row, col + 2, rec["amount_currency"], txt_name)
                        sheet.write(row, col + 3, rec["currency_id"], txt_name)
                        sheet.merge_range(
                            row, col + 4, row, col + 5, rec["account_id"], txt_name
                        )
                        sheet.merge_range(
                            row, col + 6, row, col + 7, rec["date_maturity"], txt_name
                        )
                        sheet.write(row, col + 8, rec["diff0"], txt_name)
                        sheet.write(row, col + 9, rec["diff1"], txt_name)
                        sheet.write(row, col + 10, rec["diff2"], txt_name)
                        sheet.write(row, col + 11, rec["diff3"], txt_name)
                        sheet.write(row, col + 12, rec["diff4"], txt_name)
                        sheet.write(row, col + 13, rec["diff5"], txt_name)
                        sheet.write(row, col + 14, " ", txt_name)
                sheet.merge_range(row + 1, col, row + 1, col + 7, "Total", filter_head)
                sheet.write(
                    row + 1, col + 8, data["grand_total"]["diff0_sum"], filter_head
                )
                sheet.write(
                    row + 1, col + 9, data["grand_total"]["diff1_sum"], filter_head
                )
                sheet.write(
                    row + 1, col + 10, data["grand_total"]["diff2_sum"], filter_head
                )
                sheet.write(
                    row + 1, col + 11, data["grand_total"]["diff3_sum"], filter_head
                )
                sheet.write(
                    row + 1, col + 12, data["grand_total"]["diff4_sum"], filter_head
                )
                sheet.write(
                    row + 1, col + 13, data["grand_total"]["diff5_sum"], filter_head
                )
                sheet.write(
                    row + 1, col + 14, data["grand_total"]["total_credit"], filter_head
                )
        workbook.close()
        output.seek(0)
        response.stream.write(output.read())
        output.close()
