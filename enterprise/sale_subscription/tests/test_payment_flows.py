# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from datetime import timedelta
from unittest.mock import patch

from odoo.exceptions import AccessError
from odoo.tests import tagged, JsonRpcException
from odoo.tools import mute_logger

from odoo import fields
from odoo.addons.payment.tests.http_common import PaymentHttpCommon
from odoo.addons.sale_subscription.controllers.portal import CustomerPortal
from odoo.addons.website.tools import MockRequest
from odoo.addons.sale_subscription.tests.test_sale_subscription import TestSubscriptionCommon
from odoo.addons.website.tools import MockRequest


@tagged('post_install', '-at_install')
class TestSubscriptionPaymentFlows(TestSubscriptionCommon, PaymentHttpCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.order = cls.env['sale.order'].create({
            'partner_id': cls.partner.id,
        })
        cls.user_with_so_access = cls.env['res.users'].create({
            'groups_id': [(6, 0, [cls.env.ref('base.group_portal').id])],
            'login': 'user_a_pouet',
            'password': 'user_a_pouet',  # may the min password length burn in hell
            'name': 'User A',
        })
        cls.user_without_so_access = cls.env['res.users'].create({
            'groups_id': [(6, 0, [cls.env.ref('base.group_portal').id])],
            'login': 'user_b_pouet',
            'password': 'user_b_pouet',
            'name': 'User B',
        })
        # Portal access rule currently relies on mail follower(s) of the order
        cls.order._message_subscribe(partner_ids=[cls.user_with_so_access.partner_id.id])

    def _my_sub_assign_token(self, **values):
        url = self._build_url(f"/my/subscriptions/assign_token/{self.order.id}")
        with mute_logger('odoo.addons.base.models.ir_rule', 'odoo.http'):
            return self.make_jsonrpc_request(url, params=values)

    def test_assign_token_route_with_so_access(self):
        """Test Assign Token Route with a user allowed to access the SO."""
        self.authenticate(self.user_with_so_access.login, self.user_with_so_access.login)
        dumb_token_so_user = self._create_token(
            partner_id=self.user_with_so_access.partner_id.id
        )
        _response = self._my_sub_assign_token(token_id=dumb_token_so_user.id)
        self.assertEqual(
            self.order.payment_token_id, dumb_token_so_user,
            "Logged Customer wasn't able to assign their token to their subscription."
        )

    def test_assign_token_without_so_access(self):
        """Test Assign Token Route with a user without access to the SO."""
        self.authenticate(
            self.user_without_so_access.login,
            self.user_without_so_access.login,
        )

        # 1) with access token
        own_token = self._create_token(
            partner_id=self.user_without_so_access.partner_id.id
        )
        response = self._my_sub_assign_token(
            token_id=own_token.id,
            access_token=self.order._portal_ensure_token(),
        )
        self.assertEqual(
            self.order.payment_token_id, own_token,
            "User wasn't able to assign their token to the subscription of another customer,"
            " even with the right access token.",
        )

        # 2) Without access token
        with self._assertNotFound():
            self._my_sub_assign_token(token_id=own_token.id)

        # 3) With wrong access token
        with self._assertNotFound():
            self._my_sub_assign_token(
                token_id=own_token.id,
                access_token="hohoho",
            )

    def test_assign_token_payment_token_access(self):
        self.authenticate(self.user_with_so_access.login, self.user_with_so_access.login)

        # correct token
        dumb_token_so_user = self._create_token(
            payment_details=f'token {self.user_with_so_access.name}',
            partner_id=self.user_with_so_access.partner_id.id,
        )
        _response = self._my_sub_assign_token(token_id=dumb_token_so_user.id)
        self.assertEqual(
            self.order.payment_token_id, dumb_token_so_user,
            "Logged Customer wasn't able to assign their token to their subscription."
        )

        # token of other user --> forbidden
        other_user_token = self._create_token(
            payment_details=f'token {self.user_without_so_access.name}',
            partner_id=self.user_without_so_access.partner_id.id,
        )
        with self.assertRaises(AccessError):
            # Make sure the test correctly tests what it should be testing
            # i.e. assigning a token not belonging to the user of the request
            other_user_token.with_user(self.user_with_so_access).read()

        with self._assertNotFound():
            self._my_sub_assign_token(token_id=other_user_token.id)

        # archived token --> forbidden
        archived_token = self._create_token(
            payment_details=f"archived token {self.user_with_so_access.name}",
            partner_id=self.user_with_so_access.partner_id.id,
        )
        archived_token.action_archive()
        with self._assertNotFound():
            self._my_sub_assign_token(token_id=archived_token.id)

        other_user_token.unlink()
        deleted_token_id = other_user_token.id

        with self._assertNotFound():
            self._my_sub_assign_token(token_id=deleted_token_id)

        self.assertEqual(
            self.order.payment_token_id, dumb_token_so_user,
            "Previous forbidden operations shouldn't have modified the SO token"
        )

    def test_assign_token_maximum_amount(self):
        self.authenticate(self.user_with_so_access.login, self.user_with_so_access.login)
        token = self._create_token(
            partner_id=self.user_with_so_access.partner_id.id
        )
        token.provider_id.maximum_amount = 1
        self.env['sale.order.line'].create({
            'order_id': self.order.id,
            'product_id': self.product.id,
            'price_unit': 100
        })

        self.assertGreater(
            self.order.amount_total,
            self.payment_token.provider_id.maximum_amount,
            'The subscription amount should be greater than the maximum amount on the provider for this test.'
        )

        with self.assertRaisesRegex(JsonRpcException, "odoo.exceptions.UserError"):
            self._my_sub_assign_token(token_id=token.id)

        self.assertFalse(self.order.payment_token_id, 'The payment token should not have been assigned.')

    @mute_logger('odoo.http')
    def test_transaction_route_rejects_unexpected_kwarg(self):
        url = self._build_url(f'/my/subscriptions/{self.order.id}/transaction')
        route_kwargs = {
            'access_token': self.order._portal_ensure_token(),
            'partner_id': self.partner.id,  # This should be rejected.
        }
        with mute_logger("odoo.http"), self.assertRaises(
            JsonRpcException, msg='odoo.exceptions.ValidationError'
        ):
            self.make_jsonrpc_request(url, route_kwargs)

    @mute_logger('odoo.http')
    def test_transaction_route_from_email(self):
        url = self._build_url(f'/my/subscriptions/{self.subscription.id}/transaction')
        self.subscription.write({
            'partner_id': self.partner.id,
            'company_id': self.company.id,
            'sale_order_template_id': self.subscription_tmpl.id,
            'payment_token_id': self.payment_token.id,
        })
        self.subscription._onchange_sale_order_template_id()
        self.subscription.action_confirm()
        invoice = self.subscription._create_invoices()
        invoice._post()
        # A "send email" action triggered on invoice, sends an email with the invoice access token
        # but the subscription transaction url expects the order access_token.
        # Make sure that if the wrong access_token is sent throw validation error.
        route_kwargs = {
            'access_token': invoice._portal_ensure_token(),
        }
        with mute_logger("odoo.http"), self.assertRaises(
            JsonRpcException, msg='odoo.exceptions.ValidationError'
        ):
            self.make_jsonrpc_request(url, route_kwargs)

    def test_check_mandate_start_date(self):
        now = fields.Datetime.now()
        self.subscription.write({'start_date': now - timedelta(days=10)})
        tx = self._create_transaction(
            'direct', tokenize=True, sale_order_ids=[self.subscription.id]
        )
        tx_mandate_values = tx._get_mandate_values()
        self.assertGreaterEqual(
            tx_mandate_values['start_datetime'].timestamp(), (now - timedelta(days=1)).timestamp(),
            f"Subscription mandate should start at least {now}",
        )

    def test_payment_link_renewed(self):
        self.subscription.write({
            'partner_id': self.partner.id,
            'company_id': self.company.id,
            'sale_order_template_id': self.subscription_tmpl.id,
            'payment_token_id': self.payment_token.id,
        })
        self.subscription._onchange_sale_order_template_id()
        self.subscription.action_confirm()
        invoice = self.subscription._create_invoices()
        invoice._post()
        payment_context = {'active_model': 'sale.order', 'active_id': self.subscription.id}
        # payment.link.wizard needs to access request.env when it generates the acces_token.
        # This pirouette is needed to avoid a
        with MockRequest(self.subscription.env):
            wiz = self.env['payment.link.wizard'].with_context(payment_context).create({})
            pay_url = wiz.link
        self.assertFalse(wiz.warning_message, "The wizard has no warning message")
        action = self.subscription.with_context(tracking_disable=False).prepare_renewal_order()
        renewal_so = self.env['sale.order'].browse(action['res_id'])
        renewal_so = renewal_so.with_context(tracking_disable=False)
        renewal_so.order_line.product_uom_qty = 3
        renewal_so.name = "Renewal"
        renewal_so.action_confirm()
        with MockRequest(self.subscription.env):
            wiz = self.env['payment.link.wizard'].with_context(payment_context).create({})
            self.assertEqual(wiz.warning_message, "You cannot generate a payment link for a renewed subscription")
        res = self.url_open(pay_url)
        self.assertEqual(res.status_code, 200, "Response should = OK")
        content = res.content.decode("utf-8")
        self.assertTrue("There is nothing to pay." in content, "There is nothing to pay for payment link of renewed order")

    def test_check_mandate_no_start_date(self):
        now = fields.Datetime.now()
        self.subscription.write({'start_date': None})
        tx = self._create_transaction(
            'direct', tokenize=True, sale_order_ids=[self.subscription.id]
        )
        tx_mandate_values = tx._get_mandate_values()
        self.assertGreaterEqual(
            tx_mandate_values['start_datetime'].timestamp(), (now - timedelta(days=1)).timestamp(),
            f"Subscription mandate should start at least {now}",
        )
