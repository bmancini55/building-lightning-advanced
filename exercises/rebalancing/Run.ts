import { ClientFactory } from "../../shared/ClientFactory";
import util from "util";

async function run(): Promise<void> {
    // Constructs a LND client from the environment variables
    const client = await ClientFactory.lndFromEnv();

    // Read the amount from the command line
    const amt = Number(process.argv[2]);

    // Read the hop pubkeys as hex strings and convert them to buffers
    const hop_pubkeys = process.argv[3].split(",").map(hexToBuf);

    // Convert the amount to millisatoshi
    const amt_msat = (amt * 1000).toString();

    // Load channels before
    const startChannels = await client.listChannels();

    // Construct a new invoice for the amount
    const invoice = await client.addInvoice({ amt });
    console.log(util.inspect(invoice, false, 10, true));

    // Build a route using the hop_pubkeys
    const { route } = await client.buildRoute({
        final_cltv_delta: 40,
        hop_pubkeys,
        amt_msat,
    });

    // Modify the last hop to include the payment_secret and total_amt_msat values
    route.hops[route.hops.length - 1].mpp_record = {
        payment_addr: invoice.payment_addr,
        total_amt_msat: amt_msat,
    };
    console.log(util.inspect(route, false, 10, true));

    // Send the payment for our invoice along our route
    const result = await client.sendToRouteV2(invoice.r_hash, route, false);
    console.log(util.inspect(result, false, 10, true));

    // Give channel balances time to settle
    await wait(1000);

    // Capture end channels
    const endChannels = await client.listChannels();

    // Output balance changes
    for (const start of startChannels.channels) {
        const end = endChannels.channels.find(e => e.chan_id === start.chan_id);
        console.log(
            "channel",
            start.initiator ? "outgoing" : "incoming",
            start.chan_id,
            "start_balance",
            start.local_balance,
            "end_balance",
            end?.local_balance,
        );
    }
}

run().catch(console.error);

function hexToBuf(hex: string) {
    return Buffer.from(hex, "hex");
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
