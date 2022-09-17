import * as Bitcoin from "@node-lightning/bitcoin";
import bodyParser from "body-parser";
import express from "express";
import { Api } from "../ApiTypes";
import { Request } from "./Request";
import { RequestManager } from "./RequestManager";

export function api(requestManager: RequestManager) {
    const router = express();
    router.use(bodyParser.json({}));
    router.post("/api/swap/out", (req, res, next) => swapOut(req, res).catch(next));
    return router;

    async function swapOut(req: express.Request, res: express.Response) {
        const body = req.body;
        const htlcClaimAddress = body.htlcClaimAddress;
        const hash = Buffer.from(body.hash, "hex");
        const swapOutSats = Bitcoin.Value.fromSats(body.swapOutSats);
        const request = new Request(requestManager.logger, htlcClaimAddress, hash, swapOutSats);
        await requestManager.addRequest(request);

        const response: Api.SwapOutResponse = {
            htlcRefundAddress: request.htlcRefundAddress,
            paymentRequest: request.paymentRequest,
        };
        res.json(response);
    }
}
