import calendar
import io
import json
from datetime import datetime

import xlsxwriter
from dateutil.relativedelta import relativedelta

from odoo import api, fields, models
from odoo.tools import date_utils
from odoo.exceptions import UserError

class AccountGeneralLedger(models.TransientModel):
    """For creating General Ledger report"""

    _name = "account.general.ledger"
    _description = "General Ledger Report"

    @api.model
    def view_report(self, journal_id=None, date_range=None, *args, **kwargs):
        """Retorna catálogos iniciales para el front (sin datos de líneas)."""
        # 1) Diarios activos de la compañía
        journal_ids = self.env["account.journal"].search_read(
            [("company_id", "=", self.env.company.id), ("active", "=", True)],
            ["name", "code", "type"],
        )

        # 2) Cuentas analíticas activas de la compañía
        analytic_ids = self.env["account.analytic.account"].search_read(
            [("company_id", "=", self.env.company.id), ("active", "=", True)],
            ["name"],
        )

        # 3) Cuentas contables no deprecadas (OJO: aquí no existe 'active')
        account_ids = self.env["account.account"].search_read(
            [("company_id", "=", self.env.company.id), ("deprecated", "=", False)],
            ["name", "code"],
            order="code asc",
        )

        return {
            "journal_ids": journal_ids,
            "analytic_ids": analytic_ids,
            "account_ids": account_ids,
            "account_totals": {},  # vacío inicialmente
        }
    @api.model
    def get_filter_values(
        self, journal_id, date_range, options, analytic, method, account_ids=None
    ):
        if not date_range:
            raise UserError("Please select a date range")
        elif ('start_date' in date_range) ^ ('end_date' in date_range):
            raise UserError("Debes especificar tanto start_date como end_date.")

        account_dict = {}
        account_totals = {}
        today = fields.Date.today()
        quarter_start, quarter_end = date_utils.get_quarter(today)
        previous_quarter_start = quarter_start - relativedelta(months=3)
        previous_quarter_end = quarter_start - relativedelta(days=1)
        if options == {}:
            options = None
        if options is None:
            option_domain = ["posted"]
        elif "draft" in options:
            option_domain = ["posted", "draft"]
        domain = (
            [
                ("journal_id", "in", journal_id),
                ("parent_state", "in", option_domain),
            ]
            if journal_id
            else [
                ("parent_state", "in", option_domain),
            ]
        )
        if account_ids:
            domain += [("account_id", "in", account_ids)]
        if method == {}:
            method = None
        if method is not None and "cash" in method:
            domain += [
                ("journal_id", "in", self.env.company.tax_cash_basis_journal_id.ids),
            ]
        if analytic:
            analytic_line = (
                self.env["account.analytic.line"]
                .search([("account_id", "in", analytic)])
                .mapped("id")
            )
            domain += [("analytic_line_ids", "in", analytic_line)]
        if date_range:
            if date_range == "month":
                domain += [("date", ">=", today.replace(day=1)), ("date", "<=", today)]
            elif date_range == "year":
                domain += [
                    ("date", ">=", today.replace(month=1, day=1)),
                    ("date", "<=", today),
                ]
            elif date_range == "quarter":
                domain += [("date", ">=", quarter_start), ("date", "<=", quarter_end)]
            elif date_range == "last-month":
                last_month_start = today.replace(day=1) - relativedelta(months=1)
                last_month_end = last_month_start + relativedelta(
                    day=calendar.monthrange(
                        last_month_start.year, last_month_start.month
                    )[1]
                )
                domain += [
                    ("date", ">=", last_month_start),
                    ("date", "<=", last_month_end),
                ]
            elif date_range == "last-year":
                last_year_start = today.replace(month=1, day=1) - relativedelta(years=1)
                last_year_end = last_year_start.replace(month=12, day=31)
                domain += [
                    ("date", ">=", last_year_start),
                    ("date", "<=", last_year_end),
                ]
            elif date_range == "last-quarter":
                domain += [
                    ("date", ">=", previous_quarter_start),
                    ("date", "<=", previous_quarter_end),
                ]
            elif "start_date" in date_range and "end_date" in date_range:
                start_date = datetime.strptime(
                    date_range["start_date"], "%Y-%m-%d"
                ).date()
                end_date = datetime.strptime(date_range["end_date"], "%Y-%m-%d").date()
                domain += [("date", ">=", start_date), ("date", "<=", end_date)]
            elif "start_date" in date_range:
                start_date = datetime.strptime(
                    date_range["start_date"], "%Y-%m-%d"
                ).date()
                domain += [("date", ">=", start_date)]
            elif "end_date" in date_range:
                end_date = datetime.strptime(date_range["end_date"], "%Y-%m-%d").date()
                domain += [("date", "<=", end_date)]
        move_line_ids = self.env["account.move.line"].search(domain)
        move_line_ids.mapped("account_id")
        account_ids = move_line_ids.mapped("account_id")
        account_dict["journal_ids"] = self.env["account.journal"].search_read(
             [("company_id", "=", self.env.company.id), ("active", "=", True)],
             ["name", "code", "type"]
        )
        account_dict["analytic_ids"] = self.env["account.analytic.account"].search_read(
            [("company_id", "=", self.env.company.id), ("active", "=", True)],
            ["name"]
        )
        account_dict["account_ids"] = self.env['account.account'].search_read(
             [("company_id", "=", self.env.company.id), ("deprecated", "=", False)],
             ["name", "code"],
             order="code asc"
        )
        
        for account in account_ids:
            move_line_id = move_line_ids.filtered(lambda x: x.account_id == account)
            move_line_list = []
            for move_line in move_line_id:
                move_line_data = move_line.read(
                    [
                        "date",
                        "name",
                        "move_name",
                        "debit",
                        "credit",
                        "partner_id",
                        "account_id",
                        "journal_id",
                        "analytic_distribution",
                        "move_id",
                        "analytic_line_ids",
                    ]
                )
                analytic_account_id = False
                analytic_account_name = ""
                if move_line.analytic_distribution:
                    analytic_account_id = int(list(move_line.analytic_distribution.keys())[0])
                    analytic_account = self.env['account.analytic.account'].browse(analytic_account_id)
                    analytic_account_name = analytic_account.name if analytic_account.exists() else ""

                move_line_data[0]['analytic_id'] = [analytic_account_id, analytic_account_name] if analytic_account_id else False
                move_line_list.append(move_line_data[0])
            account_dict[account.display_name] = move_line_list
            currency_id = self.env.company.currency_id.symbol
            account_totals[account.display_name] = {
                "total_debit": round(sum(move_line_id.mapped("debit")), 2),
                "total_credit": round(sum(move_line_id.mapped("credit")), 2),
                "currency_id": currency_id,
                "account_id": account.id,
            }
            account_dict["account_totals"] = account_totals
        return account_dict

    @api.model
    def get_xlsx_report(self, data, response, report_name, report_action):
       
        data = json.loads(data)
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {"in_memory": True})
        start_date = (
            data["filters"]["start_date"] if data["filters"]["start_date"] else ""
        )
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
        sheet.write("B4:b4", "Journals", filter_head)
        sheet.write("B5:b4", "Analytic", filter_head)
        sheet.write("B6:b4", "Options", filter_head)
        if start_date or end_date:
            sheet.merge_range("C3:G3", f"{start_date} to {end_date}", filter_body)
        if data["filters"]["journal"]:
            display_names = [journal for journal in data["filters"]["journal"]]
            display_names_str = ", ".join(display_names)
            sheet.merge_range("C4:G4", display_names_str, filter_body)
        if data["filters"]["analytic"]:
            display_names = [analytic for analytic in data["filters"]["analytic"]]
            account_keys_str = ", ".join(display_names)
            sheet.merge_range("C5:G5", account_keys_str, filter_body)
        if data["filters"]["options"]:
            option_keys = list(data["filters"]["options"].keys())
            option_keys_str = ", ".join(option_keys)
            sheet.merge_range("C6:G6", option_keys_str, filter_body)
        if data:
            if report_action == "dynamic_accounts_report.action_general_ledger":
                sheet.write(8, col, " ", sub_heading)
                sheet.write(8, col + 1, "Date", sub_heading)
                sheet.merge_range("C9:E9", "Communication", sub_heading)
                sheet.merge_range("F9:G9", "Partner", sub_heading)
                sheet.merge_range("H9:I9", "Analytic", sub_heading)
                sheet.merge_range("J9:K9", "Debit", sub_heading)
                sheet.merge_range("L9:M9", "Credit", sub_heading)
                sheet.merge_range("N9:O9", "Balance", sub_heading)
                # Dentro del if report_action ... antes del bucle de cuentas:
                row = 8
                for account in data["account"]:
                    row += 1
                    sheet.write(row, col, account, txt_name)
                    sheet.write(row, col + 1, " ", txt_name)
                    sheet.merge_range(row, col + 2, row, col + 4, " ", txt_name)  # Communication
                    sheet.merge_range(row, col + 5, row, col + 6, " ", txt_name)  # Partner
                    sheet.merge_range(
                        row, col + 7, row, col + 8, " ", txt_name                 # Analytic  (vacío en el subtotal de cuenta)
                    )
                    sheet.merge_range(
                        row, col + 9, row, col + 10, data["total"][account]["total_debit"], txt_name
                    )  # Debit
                    sheet.merge_range(
                        row, col + 11, row, col + 12, data["total"][account]["total_credit"], txt_name
                    )  # Credit
                    sheet.merge_range(
                        row, col + 13, row, col + 14,
                        data["total"][account]["total_debit"] - data["total"][account]["total_credit"],
                        txt_name,
                    )  # Balance

                    sheet.merge_range(
                        row,
                        col + 11,
                        row,
                        col + 12,
                        data["total"][account]["total_debit"]
                        - data["total"][account]["total_credit"],
                        txt_name,
                    )
                    for rec in data["data"].get(account, []):
                        row += 1
                        line = rec[0] if isinstance(rec, (list, tuple)) else rec

                        partner = line.get("partner_id")
                        partner_name = partner[1] if partner else ""
                

                        move_name = line.get("move_name", "")
                        date_val = line.get("date", "")
                        name_val = line.get("name", "") if line.get("name") else ""
                        debit = line.get("debit") or 0.0
                        credit = line.get("credit") or 0.0
                        analytic_label = line.get("_analytic_label") or ""  

                        factura = (line.get("ref") or line.get("move_name")or"")

                        sheet.write(row, col + 0, factura, txt_name)
                        sheet.write(row, col + 1, date_val, txt_name)

                        sheet.merge_range(row, col + 2, row, col + 4, name_val, txt_name)
                        sheet.merge_range(row, col + 5, row, col + 6, partner_name, txt_name)
                        sheet.merge_range(row, col + 7, row, col + 8, analytic_label, txt_name)
                        sheet.merge_range(row, col + 9, row, col + 10, debit, txt_name)
                        sheet.merge_range(row, col + 11, row, col + 12, credit, txt_name)

                        sheet.merge_range(row, col + 11, row, col + 12, " ", txt_name)
                row += 1
                sheet.merge_range(row, col, row, col + 8, "Total", filter_head)
                sheet.merge_range(
                    row,
                    col + 9,
                    row,
                    col + 10,
                    data["grand_total"]["total_debit"],
                    filter_head,
                )
                sheet.merge_range(
                    row,
                    col + 11,
                    row,
                    col + 12,
                    data["grand_total"]["total_credit"],
                    filter_head,
                )
                sheet.merge_range(
                    row,
                    col + 13,
                    row,
                    col + 14,
                    float(data["grand_total"]["total_debit"])
                    - float(data["grand_total"]["total_credit"]),
                    filter_head,
                )
        workbook.close()
        output.seek(0)
        response.stream.write(output.read())
        output.close() 