# report/reporte_por_dia_xlsx.py
import io
import base64
from datetime import datetime, time
from odoo import models, fields, api
from odoo.exceptions import UserError
try:
    import xlsxwriter
except ImportError:
    xlsxwriter = None

class ReportePorDiaXlsx(models.AbstractModel):
    _name = "helpdesk.reporte.por.dia.xlsx"
    _description = "Reporte por Día - KPI Helpdesk"

    def generate_reporte_por_dia_xlsx(self, wizard):
        if xlsxwriter is None:
            raise UserError("xlsxwriter no está disponible en el server")

        # Estados que nos interesan
        estados_interes = {
            'closed': 'Cerrado',
            'assigned': 'Asignado', 
            'new': 'Nuevo'  # Los tickets nuevos tienen estado TEC_Espera
        }

        # Empleados de soporte técnico
        empleados = wizard.employee_ids
        if not empleados:
            empleados = self.env['hr.employee'].search([('soporte_tecnico', '=', True)])
        empleados = empleados.sorted(key=lambda r: r.name)

        user_ids = empleados.mapped('user_id.id')
        
        # Construir domain para UN SOLO DÍA
        domain = [('company_id', '=', wizard.company_id.id)]
        
        if wizard.date_start:
            domain.append(('create_date', '>=', datetime.combine(wizard.date_start, time.min)))
            domain.append(('create_date', '<=', datetime.combine(wizard.date_start, time.max)))

        domain.append(('user_id', 'in', user_ids))
        
        tickets = self.env['helpdesk.support'].search(domain)

        # Inicializar conteos
        conteo = {}
        total_cerrados = 0
        total_nuevos = 0  # Contador total de tickets nuevos
                
        for estado_code in estados_interes.keys():
            conteo[estado_code] = {emp.name: 0 for emp in empleados}

        # Contar tickets
        for ticket in tickets:
            tecnico_name = ticket.user_id.employee_id.name if ticket.user_id.employee_id else 'Sin asignar'
            estado_actual = ticket.stage_id.name if ticket.stage_id else None
            
            # Determinar el tipo de estado según nuestra clasificación
            estado_code = None
            if estado_actual == 'new':
                estado_code = 'new'  # Tickets nuevos
            elif estado_actual in ['TEC_Asignación_Técnico', 'TEC_Ticket_Progreso', 'TEC_Supervisores', 
                                 'TEC_Soporte a PRG', 'PRG_Asignado_(Proceso_PRG)', 'COTIZACION_PRG',
                                 'PRG_Validación_TEC', 'MEJORAS EN PROCESOS']:
                estado_code = 'assigned'  # Tickets asignados/en proceso
            elif estado_actual == 'TEC_Cerrado':
                estado_code = 'closed'  # Tickets cerrados

            # Solo contar estados que nos interesan
            if estado_code not in estados_interes:
                continue

            # Para tickets NUEVOS (TEC_Espera): contar en total pero NO por técnico
            if estado_code == "new":
                total_nuevos += 1
                continue  # Saltar el conteo por técnico para nuevos

            # Para tickets ASIGNADOS y CERRADOS: contar por técnico
            if tecnico_name not in conteo[estado_code]:
                conteo[estado_code][tecnico_name] = 0

            conteo[estado_code][tecnico_name] += 1
            
            # Contar solo CERRADOS para el total general
            if estado_code == "closed":
                total_cerrados += 1

        # Crear Excel
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet("Reporte por Día")

        # Formatos
        header_format = workbook.add_format({
            'bold': True, 
            'bg_color': '#366092', 
            'font_color': 'white',
            'align': 'center',
            'border': 1
        })
        
        tecnico_format = workbook.add_format({
            'bold': True,
            'bg_color': '#E6E6E6',
            'border': 1
        })
        
        numero_format = workbook.add_format({
            'align': 'center',
            'border': 1
        })
        
        total_format = workbook.add_format({
            'bold': True,
            'bg_color': '#FFCC00',
            'align': 'center',
            'border': 1
        })
        
        nuevos_format = workbook.add_format({
            'bold': True,
            'bg_color': '#FF9999',
            'align': 'center',
            'border': 1
        })

        # Título - Solo un día
        fecha_reporte = wizard.date_start.strftime("%d/%m/%Y") if wizard.date_start else "Fecha no especificada"
        
        worksheet.merge_range('A1:D1', 'REPORTE POR DÍA - HELP DESK', header_format)
        worksheet.merge_range('A2:D2', f'Fecha: {fecha_reporte}', workbook.add_format({'align': 'center'}))

        # Cabecera de tabla
        worksheet.write(2, 0, "TÉCNICO", header_format)
        worksheet.write(2, 1, "CERRADOS", header_format)
        worksheet.write(2, 2, "ASIGNADOS", header_format)
        worksheet.write(2, 3, "NUEVOS", header_format)

        # Datos por técnico (solo cerrados y asignados)
        row = 3
        for emp in empleados:
            worksheet.write(row, 0, emp.name, tecnico_format)
            worksheet.write_number(row, 1, conteo['closed'].get(emp.name, 0), numero_format)
            worksheet.write_number(row, 2, conteo['assigned'].get(emp.name, 0), numero_format)
            worksheet.write(row, 3, "", numero_format)  # Dejar vacío para nuevos
            row += 1

        # FILA ESPECIAL PARA TICKETS NUEVOS (TEC_Espera - SIN ASIGNAR)
        worksheet.write(row, 0, "TICKETS NUEVOS (TEC_Espera)", tecnico_format)
        worksheet.write(row, 1, "", numero_format)  # Vacío para cerrados
        worksheet.write(row, 2, "", numero_format)  # Vacío para asignados
        worksheet.write_number(row, 3, total_nuevos, nuevos_format)
        row += 1

        # TOTAL GENERAL - Solo tickets CERRADOS
        worksheet.merge_range(row, 0, row, 2, "TOTAL GENERAL (CERRADOS)", total_format)
        worksheet.write_number(row, 3, total_cerrados, total_format)

        # Ajustar anchos de columna
        worksheet.set_column('A:A', 25)
        worksheet.set_column('B:D', 12)

        # Fecha de generación
        worksheet.write(row + 2, 0, f"Generado el: {datetime.now().strftime('%d/%m/%Y %H:%M')}")

        workbook.close()
        output.seek(0)
        return output.read()