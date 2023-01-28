import { IRequest, Router } from 'itty-router'
import { text } from 'itty-router-extras'
import '@shopify/shopify-api/adapters/cf-worker'
import { ApiVersion, shopifyApi as _shopifyApi, Session } from '@shopify/shopify-api'
import HTMLCreatorDocument from "./document";

/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	SHOPIFY_API_KEY: string
	SHOPIFY_API_SECRET: string
	SHOPIFY_STORE_DOMAIN: string
	SHOPIFY_TOKEN_ACCESS: string
	CMI_ENDPOINT: string
	CMI_CLIENT_ID: string
	CMI_STORE_KEY: string
}

const router = Router()

async function shopifyApi(url: string, env: Env) {
	const _url = new URL(url)
	const shopify = _shopifyApi({
		apiKey: env.SHOPIFY_API_KEY,
		apiSecretKey: env.SHOPIFY_TOKEN_ACCESS,
		scopes: ['write_orders', 'read_orders'],
		hostName: _url.host,
		apiVersion: ApiVersion.January23,
		isEmbeddedApp: false,
		isPrivateApp: true,
	})
	const sessionId = await shopify.session.getOfflineId(env.SHOPIFY_STORE_DOMAIN);
	const session = new Session({
		id: sessionId,
		shop: env.SHOPIFY_STORE_DOMAIN,
		state: '',
		isOnline: false,
		accessToken: env.SHOPIFY_TOKEN_ACCESS,
	})
	return new shopify.clients.Rest({ session });
}

router.get('/payment/:orderId', async (
	{ params, proxy, url }: IRequest,
	env: Env,
	ctx: ExecutionContext
) => {
	const shopify = await shopifyApi(url, env)
	const order = await Promise.all([
		shopify.get<any>({
			path: '/admin/orders/' + params.orderId,
			query: {
				fields: 'id,customer,billingAddress,order_status_url,total_price'
			},

		}).then(response => response.body.order),
		shopify.get<any>({
			path: '/admin/orders/' + params.orderId + '/transactions',
			query: {
				fields: 'id'
			},

		}).then(response => response.body.transactions[0].id)
	]).then(
		([order, transactionId]) => ({ ...order, transactionId })
	)
	const _url = new URL(url)
	const form: any = {
		clientid: env.CMI_CLIENT_ID,
		oid: order.id,
		tid: order.transactionId,
		amount: order.total_price,
		currency: 504,

		callbackUrl: _url.origin + `/payment/${params.orderId}/callback`,
		shopurl: 'https://' + env.SHOPIFY_STORE_DOMAIN,
		okUrl: order.order_status_url,
		failUrl: order.order_status_url,
		refreshtime: 5,
		lang: 'fr',

		BillToName: order.billing_address.name,
		BillToStreet1: order.billing_address.address1,
		BillToStreet2: order.billing_address.address2,
		BillToCompany: order.billing_address.company || '',
		BillToCity: order.billing_address.city,
		BillToPostalCode: order.billing_address.zip || '',
		BillToCountry: order.billing_address.country_code,

		email: order.customer.email,
		phone: order.billing_address.phone,

		storetype: '3D_PAY_HOSTING',
		trantype: 'PreAuth',
		hashAlgorithm: 'ver3',

		rnd: Date.now(),

		DIMCRITERIA1: env.SHOPIFY_STORE_DOMAIN.split('.').shift(),
	};
	const parameters = Object.keys(form).sort((a, b) =>
		a.toLowerCase().localeCompare(b.toLowerCase()),
	);

	const input = parameters
		.map((parameter) => form[parameter])
		.concat(env.CMI_STORE_KEY)
		.join('|')
	const dataToDigest = new TextEncoder().encode(
		input
	)

	const digest = await crypto.subtle.digest(
		{
			name: 'SHA-512',
		},
		dataToDigest
	);

	const hash = btoa(String.fromCharCode(...new Uint8Array(digest)))

	form.hash = hash
	form.encoding = 'UTF-8'

	const html = new HTMLCreatorDocument([
		{
			type: 'head',
			content: [{ type: 'title', content: 'Payment for order #' + order.id }],
		},
		{
			type: 'body',
			content: [
				{
					type: 'form',
					attributes: {
						method: 'POST',
						action: env.CMI_ENDPOINT,
					},
					content: [
						...parameters.concat('hash', 'encoding').map((parameter) => ({
							type: 'input',
							attributes: {
								type: 'hidden',
								name: parameter,
								value: form[parameter],
							},
						})),
						{
							type: 'script',
							attributes: {
								type: 'text/javascript',
							},
							content: `document.querySelector('form').submit()`,
						},
					],
				},
			],
		},
	]);
	return new Response(html.getHTML(), { headers: { 'content-type': 'text/html;charset=UTF-8' } });
})

router.post('/payment/:orderId/callback', async (
	request: IRequest,
	env: Env,
	ctx: ExecutionContext
) => {
	const formData: FormData = await request.formData()
	const body = Object.fromEntries(formData.entries())
	console.log('callback', body)
	const parameters = Object.keys(body)
		.filter((key) => !['hash', 'encoding'].includes(key.toLowerCase()))
		.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

	const input = parameters
		.map((parameter) => body[parameter].trim())
		.concat(env.CMI_STORE_KEY)
		.join('|')
	const dataToDigest = new TextEncoder().encode(
		input
	)

	const digest = await crypto.subtle.digest(
		{
			name: 'SHA-512',
		},
		dataToDigest
	);

	const hash = btoa(String.fromCharCode(...new Uint8Array(digest)))

	if (hash != body.HASH) {
		console.log('FAILURE', hash)
		return text('FAILURE')
	}
	const shopify = await shopifyApi(request.url, env)

	await shopify.post({
		path: '/admin/orders/' + body.oid + '/transactions',
		data: {
			transaction: {
				kind: 'capture',
				parent_id: body.tid,
				status: 'success'
			}
		}
	})

	return text('ACTION=POSTAUTH')
})

export default {
	fetch: router.handle
};
