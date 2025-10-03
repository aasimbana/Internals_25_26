import io
from datetime import datetime, time
from odoo import models
from odoo.exceptions import UserError
try:
    import xlsxwriter
except ImportError:
    xlsxwriter = None

class ReportByCompanyXlsx(models.AbstractModel):
    _name = "helpdesk.report.by.company.xlsx"
    _description = "Report by Company - Helpdesk KPI"

    
    def generate_xlsx_report(self, wizard):
        if xlsxwriter is None:
            raise UserError("xlsxwriter is not available on the server")

        self.env.cr.execute("""
            SELECT DISTINCT stage_type 
            FROM helpdesk_support 
            WHERE stage_type IS NOT NULL 
            ORDER BY stage_type ASC
        """)
        results = self.env.cr.fetchall()
        stage_types = [row[0] for row in results if row[0] is not None]

        companies = wizard.company_id or self.env['res.company'].search([])

        company_data = {}
        overall_totals = {}
        overall_total = 0

        for company in companies:
            company_data[company.id] = {
                'name': company.name,
                'stage_counts': {},
                'total': 0
            }

            domain = [('company_id', '=', company.id)]
            if wizard.date_start or wizard.date_end:
                pass

            tickets = self.env['helpdesk.support'].search(domain)

            for ticket in tickets:
                stage = ticket.stage_type or 'None'
                if stage == 'closed':
                    fecha = ticket.close_date
                else:
                    fecha = ticket.create_date

                if wizard.date_start and (not fecha or fecha.date() < wizard.date_start):
                    continue
                if wizard.date_end and (not fecha or fecha.date() > wizard.date_end):
                    continue

                if stage not in company_data[company.id]['stage_counts']:
                    company_data[company.id]['stage_counts'][stage] = 0
                company_data[company.id]['stage_counts'][stage] += 1
                company_data[company.id]['total'] += 1

                if stage not in overall_totals:
                    overall_totals[stage] = 0
                overall_totals[stage] += 1

            overall_total += company_data[company.id]['total']

        all_stages_found = list(set(stage_types + list(overall_totals.keys())))
        all_stages_found.sort()

        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet("Report by Company")

        header_format = workbook.add_format({
            'bold': True, 'bg_color': '#366092', 'font_color': 'white',
            'align': 'center', 'valign': 'vcenter', 'border': 1
        })
        company_format = workbook.add_format({'bold': True, 'bg_color': '#E6E6E6', 'border': 1})
        number_format = workbook.add_format({'align': 'center', 'border': 1})
        total_format = workbook.add_format({
            'bold': True, 'bg_color': '#D9D9D9', 'align': 'center', 'border': 1
        })
        title_format = workbook.add_format({'bold': True, 'font_size': 16, 'align': 'center'})

        start_date = wizard.date_start.strftime("%d/%m/%Y") if wizard.date_start else "Not specified"
        end_date = wizard.date_end.strftime("%d/%m/%Y") if wizard.date_end else "Not specified"
        company_filter = wizard.company_id.name if wizard.company_id else "All Companies"

        worksheet.merge_range('A1:H1', 'REPORT BY COMPANY - HELPDESK', title_format)
        worksheet.merge_range('A2:H2', f'Period: {start_date} - {end_date} | Companies: {company_filter}',
                              workbook.add_format({'align': 'center', 'italic': True}))

        worksheet.write(2, 0, "Company", header_format)
        col = 1
        for stage_type in all_stages_found:
            worksheet.write(2, col, stage_type, header_format)
            col += 1
        worksheet.write(2, col, "Total", header_format)

        row = 3
        for company_id, data in company_data.items():
            worksheet.write(row, 0, data['name'], company_format)
            col = 1
            for stage_type in all_stages_found:
                count = data['stage_counts'].get(stage_type, 0)
                worksheet.write_number(row, col, count, number_format)
                col += 1
            worksheet.write_number(row, col, data['total'], total_format)
            row += 1

        if company_data:
            worksheet.write(row, 0, "Total", total_format)
            col = 1
            for stage_type in all_stages_found:
                count = overall_totals.get(stage_type, 0)
                worksheet.write_number(row, col, count, total_format)
                col += 1
            worksheet.write_number(row, col, overall_total, total_format)

        worksheet.set_column('A:A', 30)
        for i in range(1, len(all_stages_found) + 2):
            worksheet.set_column(i, i, 15)

        worksheet.write(row + 2, 0, f"Generated on: {datetime.now().strftime('%d/%m/%Y %H:%M')}")


        workbook.close()
        output.seek(0)
        return output.read()