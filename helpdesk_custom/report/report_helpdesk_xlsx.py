
import io
import json
from datetime import datetime, time
from odoo import models, fields, api
from odoo.exceptions import UserError
try:
    import xlsxwriter
except ImportError:
    xlsxwriter = None

class HelpdeskReportXlsx(models.AbstractModel):
    _name = "helpdesk.report.xlsx.helper"
    _description = "Helper para generar XLSX del reporte helpdesk"

    def generate_helpdesk_report_xlsx(self, wizard):
        if xlsxwriter is None:
            raise UserError("xlsxwriter no está disponible en el server")

        # CONSULTA SQL DIRECTA PARA OBTENER LOS NOMBRES DE LOS ESTADOS
        try:
            query = """
                SELECT name 
                FROM helpdesk_stage_config 
                WHERE name IS NOT NULL 
            """
            self.env.cr.execute(query)
            results = self.env.cr.fetchall()
            
            estados_unique = []

            for row in results:
                name_value = row[0]
                
                stage_dict = None
                # Caso 1: es string, intentar parsear JSON
                if isinstance(name_value, str):
                    try:
                        stage_dict = json.loads(name_value)
                    except json.JSONDecodeError:
                        # No es JSON, tratar como string simple
                        stage_dict = {"es_EC": name_value, "en_US": name_value}
                # Caso 2: ya es dict
                elif isinstance(name_value, dict):
                    stage_dict = name_value
                # Caso 3: otro tipo (None, int...), convertir a string
                else:
                    stage_dict = {"es_EC": str(name_value), "en_US": str(name_value)}

                # Extraer valor en español o inglés
                valor_es = stage_dict.get('es_EC')
                valor_en = stage_dict.get('en_US')
                estado_valor = valor_es or valor_en
                if estado_valor:
                    estados_unique.append(estado_valor)

            # Eliminar duplicados y mantener orden
            estados_unique = list(dict.fromkeys(estados_unique))

        except Exception as e:
            # Si falla la consulta SQL, usar lista por defecto
            raise ValueError(
                "No se pudieron obtener los estados desde la base de datos, se usará la lista por defecto"
            ) from e


        # USAR LOS NOMBRES OBTENIDOS
        estados = estados_unique
        
        empleados = wizard.employee_ids
        if not empleados:
            empleados = self.env['hr.employee'].search([('technical_support','=',True)])

        empleados = empleados.sorted(key=lambda r: r.name)

        domain = [('company_id', '=', wizard.company_id.id)]
        if wizard.date_start:
            domain.append(('create_date', '>=', datetime.combine(wizard.date_start, time.min)))
        if wizard.date_end:
            domain.append(('create_date', '<=', datetime.combine(wizard.date_end, time.max)))

        user_ids = empleados.mapped('user_id.id')
        domain.append(('user_id', 'in', user_ids))
        tickets = self.env['helpdesk.support'].search(domain)

        # INICIALIZAR CONTEO
        conteo = {}
        total_por_tecnico = {}
        total_general = 0

        # Inicializar conteo para todos los estados con todos los empleados
        for estado in estados:
            conteo[estado] = {}
            for emp in empleados:
                conteo[estado][emp.name] = 0

        # Inicializar totales por técnico para los empleados seleccionados
        for emp in empleados:
            total_por_tecnico[emp.name] = 0

        # CONTAR TICKETS
        for ticket in tickets:
            tecnico_name = ticket.user_id.employee_id.name if ticket.user_id and ticket.user_id.employee_id else 'Sin asignar'
            estado_code = ticket.stage_id.name if ticket.stage_id else 'Sin Estado'
            
            # Si el estado no está en la lista, usar "Sin Estado"
            if estado_code not in estados:
                estado_code = 'Sin Estado'
                # Si "Sin Estado" no existe en el conteo, crearlo dinámicamente
                if estado_code not in conteo:
                    conteo[estado_code] = {}
                    for emp in empleados:
                        conteo[estado_code][emp.name] = 0

            # Si el técnico no está en la lista de empleados seleccionados, usar 'Sin asignar'
            if tecnico_name not in total_por_tecnico:
                tecnico_name = 'Sin asignar'
                # Si 'Sin asignar' no existe en el conteo, crearlo dinámicamente
                if tecnico_name not in total_por_tecnico:
                    total_por_tecnico[tecnico_name] = 0
                    for estado in conteo:
                        conteo[estado][tecnico_name] = 0

            # Realizar el conteo
            conteo[estado_code][tecnico_name] += 1
            total_por_tecnico[tecnico_name] += 1
            total_general += 1

        # Crear XLSX
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet("Reporte Helpdesk")

        header_format = workbook.add_format({'bold': True, 'bg_color': '#D9E1F2', 'align': 'center'})
        estado_format = workbook.add_format({'bg_color': '#FCE4D6', 'align': 'center'})
        center = workbook.add_format({'align': 'center'})
        total_format = workbook.add_format({'bold': True, 'bg_color': '#BDD7EE', 'align': 'center'})
        total_general_format = workbook.add_format({'bold': True, 'bg_color': '#FFC000', 'align': 'center'})

        # Obtener todos los técnicos (empleados seleccionados + 'Sin asignar')
        todos_tecnicos = list(empleados.mapped('name'))
        todos_tecnicos = list(dict.fromkeys(todos_tecnicos))  # Eliminar duplicados
        todos_tecnicos.sort()

        worksheet.write(0, 0, "ESTADO / TÉCNICO", header_format)
        for col, tecnico in enumerate(todos_tecnicos, start=1):
            worksheet.write(0, col, tecnico, header_format)
        worksheet.write(0, len(todos_tecnicos)+1, "TOTAL ESTADO", header_format)

        for row, estado in enumerate(estados, start=1):
            worksheet.write(row, 0, estado, estado_format)
            total_estado = 0
            for col, tecnico in enumerate(todos_tecnicos, start=1):
                valor = conteo[estado].get(tecnico, 0)
                worksheet.write_number(row, col, valor, center)
                total_estado += valor
            worksheet.write_number(row, len(todos_tecnicos)+1, total_estado, total_format)

        row_total = len(estados) + 1
        worksheet.write(row_total, 0, "TOTAL POR TÉCNICO", total_format)
        for col, tecnico in enumerate(todos_tecnicos, start=1):
            worksheet.write_number(row_total, col, total_por_tecnico.get(tecnico, 0), total_format)

        total_general_row = row_total + 1
        worksheet.merge_range(
            total_general_row, 0,
            total_general_row, len(todos_tecnicos)+1,
            f"TOTAL GENERAL: {total_general}",
            total_general_format
        )

        fecha_row = total_general_row + 1
        fecha_inicio = wizard.date_start.strftime("%d/%m/%Y") if wizard.date_start else "N/A"
        fecha_fin = wizard.date_end.strftime("%d/%m/%Y") if wizard.date_end else "N/A"
        texto_fechas = f"Reporte generado del {fecha_inicio} al {fecha_fin}"
        worksheet.merge_range(
            fecha_row, 0,
            fecha_row, len(todos_tecnicos)+1,
            texto_fechas,
            center
        )

        workbook.close()
        output.seek(0)
        
        return output.read()