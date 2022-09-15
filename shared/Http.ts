import http from "http";

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Http {
    export async function post<T>(url: string, json: unknown): Promise<T> {
        return new Promise((resolve, reject) => {
            const options = {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
            };
            const req = http.request(url, options, res => {
                const bufs: Buffer[] = [];
                res.on("data", buf => {
                    bufs.push(buf);
                });
                res.on("end", () => {
                    const result = Buffer.concat(bufs);
                    resolve(JSON.parse(result.toString("utf-8")));
                });
            });
            req.on("error", reject);
            req.write(JSON.stringify(json));
            req.end();
        });
    }
}
