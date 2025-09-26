from odoo import models, fields
from odoo.exceptions import UserError
import io
from datetime import datetime, time
import xlsxwriter

class HelpdeskReportStatusXlsx(models.AbstractModel):
    _name = "helpdesk.report.status.xlsx"
    _description = "Helpdesk Status Report XLSX"

    def generate_report_status_xlsx(self, wizard):
        if xlsxwriter is None:
            raise UserError("xlsxwriter is not available on the server")

        if not wizard.date_end:
            raise UserError("You must select an end date in the wizard.")

        end_date = datetime.combine(wizard.date_end, time.max)

        # Get all existing stage types
        self.env.cr.execute("""
            SELECT DISTINCT stage_type
            FROM helpdesk_support
            WHERE stage_type IS NOT NULL
        """)
        results = self.env.cr.fetchall()
        stage_types = [r[0] for r in results if r[0] is not None]
        stage_types.sort()

        if not stage_types:
            raise UserError("No valid stages were found in the database.")

        # Get the company selected in the wizard
        company = wizard.company_id
        if not company:
            raise UserError("You must select a valid company.")

        # Get tickets up to the end date
        tickets = self.env['helpdesk.support'].search([
            ('request_date', '<=', end_date),
            ('company_id', '=', company.id),
            ('active', '=', True),
            ('stage_type', '!=', False),
        ])

        if not tickets:
            raise UserError(f"No tickets were found for {company.name} up to {wizard.date_end}.")

        # Build the data matrix
        data = {stage: {st: 0 for st in stage_types} for stage in stage_types}

        for ticket in tickets:
            stage = str(ticket.stage_type)
            data[stage][stage] += 1  # Logic: cross stage with stage

        # Create XLSX
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet("Status Report")

        header_format = workbook.add_format({
            'bold': True, 'bg_color': '#FFFF00', 'align': 'center', 'border': 1
        })
        cell_format = workbook.add_format({'align': 'center', 'border': 1})

        # Header
        worksheet.write(0, 0, "Total", header_format)
        for col, st in enumerate(stage_types, start=1):
            worksheet.write(0, col, st, header_format)
        worksheet.write(0, len(stage_types) + 1, "Number", header_format)

        # Rows per stage
        row = 1
        for stage in stage_types:
            worksheet.write(row, 0, stage, cell_format)
            total_stage = 0
            for col, st in enumerate(stage_types, start=1):
                value = data[stage][st]
                worksheet.write(row, col, value, cell_format)
                total_stage += value
            worksheet.write(row, len(stage_types) + 1, total_stage, cell_format)
            row += 1

        # Totals per column
        worksheet.write(row, 0, "Total", header_format)
        for col, st in enumerate(stage_types, start=1):
            total_col = sum(data[stage][st] for stage in stage_types)
            worksheet.write(row, col, total_col, header_format)
        total_general = sum(data[stage][st] for stage in stage_types for st in stage_types)
        worksheet.write(row, len(stage_types) + 1, total_general, header_format)

        # Adjust column widths
        worksheet.set_column(0, 0, 25)
        for i in range(1, len(stage_types) + 2):
            worksheet.set_column(i, i, 15)

        workbook.close()
        output.seek(0)
        return output.read()
