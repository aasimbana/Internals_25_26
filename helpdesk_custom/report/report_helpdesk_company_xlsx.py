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

        # 🔹 Get all distinct stage types from database
        self.env.cr.execute("""
            SELECT DISTINCT stage_type 
            FROM helpdesk_support 
            WHERE stage_type IS NOT NULL 
            ORDER BY stage_type ASC
        """)
        results = self.env.cr.fetchall()
        stage_types = [row[0] for row in results if row[0] is not None]

        # 🔹 Build domain based on wizard filters
        domain = []
        if wizard.date_start:
            domain.append(('create_date', '>=', datetime.combine(wizard.date_start, time.min)))
        if wizard.date_end:
            domain.append(('create_date', '<=', datetime.combine(wizard.date_end, time.max)))
        if wizard.company_id:
            domain.append(('company_id', '=', wizard.company_id.id))

        # 🔹 Get ALL companies or specific company based on selection
        if wizard.company_id:
            # Si se selecciona una compañía específica
            companies = wizard.company_id
        else:
            # Si NO se selecciona ninguna compañía, traer TODAS las compañías
            companies = self.env['res.company'].search([])

        # 🔹 Count tickets by company and stage type
        company_data = {}
        
        # Initialize overall_totals dynamically based on actual stages found
        overall_totals = {}
        overall_total = 0

        for company in companies:
            company_data[company.id] = {
                'name': company.name,
                'stage_counts': {},
                'total': 0
            }
            
            # Count tickets for this company (aplicando los filtros de fecha)
            company_domain = domain.copy()
            company_domain.append(('company_id', '=', company.id))
            tickets = self.env['helpdesk.support'].search(company_domain)
            
            for ticket in tickets:
                stage = ticket.stage_type or 'None'
                
                # Initialize stage count if not exists
                if stage not in company_data[company.id]['stage_counts']:
                    company_data[company.id]['stage_counts'][stage] = 0
                company_data[company.id]['stage_counts'][stage] += 1
                company_data[company.id]['total'] += 1
                
                # Initialize overall total for this stage if not exists
                if stage not in overall_totals:
                    overall_totals[stage] = 0
                overall_totals[stage] += 1
            
            overall_total += company_data[company.id]['total']

        # 🔹 Create combined list of all stages found (from DB + actual tickets)
        all_stages_found = list(set(stage_types + list(overall_totals.keys())))
        all_stages_found.sort()

        # 🔹 Create Excel file
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet("Report by Company")

        # Formats
        header_format = workbook.add_format({
            'bold': True, 'bg_color': '#366092', 'font_color': 'white',
            'align': 'center', 'valign': 'vcenter', 'border': 1
        })
        company_format = workbook.add_format({
            'bold': True, 'bg_color': '#E6E6E6', 'border': 1
        })
        number_format = workbook.add_format({
            'align': 'center', 'border': 1
        })
        total_format = workbook.add_format({
            'bold': True, 'bg_color': '#D9D9D9', 'align': 'center', 'border': 1
        })
        title_format = workbook.add_format({
            'bold': True, 'font_size': 16, 'align': 'center'
        })

        # 🔹 Title and date range
        start_date = wizard.date_start.strftime("%d/%m/%Y") if wizard.date_start else "Not specified"
        end_date = wizard.date_end.strftime("%d/%m/%Y") if wizard.date_end else "Not specified"
        
        company_filter = wizard.company_id.name if wizard.company_id else "All Companies"
        
        worksheet.merge_range('A1:H1', 'REPORT BY COMPANY - HELPDESK', title_format)
        worksheet.merge_range('A2:H2', f'Period: {start_date} - {end_date} | Companies: {company_filter}', 
                             workbook.add_format({'align': 'center', 'italic': True}))
        
        # 🔹 Table header
        worksheet.write(2, 0, "Company", header_format)
        col = 1
        for stage_type in all_stages_found:
            display_name = stage_type if stage_type != 'None' else 'None'
            worksheet.write(2, col, display_name, header_format)
            col += 1
        worksheet.write(2, col, "Total", header_format)

        # 🔹 Company data
        row = 3
        
        for company_id, data in company_data.items():
            worksheet.write(row, 0, data['name'], company_format)
            
            # Write stage counts
            col = 1
            company_total = 0
            
            for stage_type in all_stages_found:
                count = data['stage_counts'].get(stage_type, 0)
                worksheet.write_number(row, col, count, number_format)
                company_total += count
                col += 1
            
            # Company total
            worksheet.write_number(row, col, company_total, total_format)
            row += 1

        # 🔹 Overall totals row
        if company_data:  # Only add totals if there's data
            worksheet.write(row, 0, "Total", total_format)
            col = 1
            overall_final_total = 0
            
            for stage_type in all_stages_found:
                count = overall_totals.get(stage_type, 0)
                worksheet.write_number(row, col, count, total_format)
                overall_final_total += count
                col += 1
            
            worksheet.write_number(row, col, overall_final_total, total_format)

        # 🔹 Adjust column widths
        worksheet.set_column('A:A', 30)  # Company name column
        for i in range(1, len(all_stages_found) + 2):
            worksheet.set_column(i, i, 15)

        # 🔹 Generation timestamp
        if company_data:
            worksheet.write(row + 2, 0, f"Generated on: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
        else:
            worksheet.write(3, 0, "No data found for the selected criteria")

        workbook.close()
        output.seek(0)
        return output.read()