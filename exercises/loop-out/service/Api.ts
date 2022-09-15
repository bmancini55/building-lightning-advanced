import * as Bitcoin from "@node-lightning/bitcoin";
import bodyParser from "body-parser";
import express from "express";
import { Api } from "../ApiTypes";
import { Request } from "./Request";
import { RequestManager } from "./RequestManager";

export function api(requestManager: RequestManager) {
    const router = express();
    router.use(bodyParser.json({}));
    router.post("/api/loop/out", (req, res, next) => loopOut(req, res).catch(next));
    return router;

    async function loopOut(req: express.Request, res: express.Response) {
        const body = req.body;
        const htlcClaimAddress = body.htlcClaimAddress;
        const hash = Buffer.from(body.hash, "hex");
        const loopOutSats = Bitcoin.Value.fromSats(body.loopOutSats);
        const request = new Request(htlcClaimAddress, hash, loopOutSats);
        await requestManager.addRequest(request);

        const response: Api.LoopOutResponse = {
            htlcRefundAddress: request.htlcRefundAddress,
            paymentRequest: request.paymentRequest,
        };
        res.json(response);
    }
}
