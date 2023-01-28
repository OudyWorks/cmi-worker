# CMI Merchant Cloudflare Worker
This is a Worker that you can use to process payment for your Shopify store via CMI.

## Setup
- You should have installed [NodeJS](https://nodejs.org/) and [Wrangler](https://developers.cloudflare.com/workers/wrangler/)


```html
<script type="text/javascript">
    const WORKER_URL = 'https://1a59-79-120-158-250.ngrok.io'
if (document.referrer.toLowerCase().indexOf('cmi.co.ma') == -1) {
    if ('{{checkout.transactions[0].gateway}}'.toLowerCase().indexOf('cmi') > -1) {
        document.body.innerHTML = "Redirection to CMI payment platform. Please wait …";
        window.location.replace(WORKER_URL+"/payment/{{ order_id }}");
    }
}
</script>
```