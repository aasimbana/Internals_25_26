from odoo import api, models

class SaleOrder(models.Model):
    _inherit = 'sale.order'

    @api.model
    def default_get(self, fields_list):
        vals = super().default_get(fields_list)

        company = self.env.company
        if self._context.get('default_company_id'):
            company = self.env['res.company'].browse(self._context['default_company_id'])

        icp = self.env['ir.config_parameter'].sudo().with_company(company)
        enabled = icp.get_param('sale.default_customer_enabled')
        partner_param = icp.get_param('sale.default_customer_id')

        if enabled and partner_param and 'partner_id' in fields_list and not vals.get('partner_id'):
            vals['partner_id'] = int(partner_param)
        return vals
