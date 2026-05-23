import type { ExecutorEncoder } from "executooor-viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import { OneInch } from "../../src/liquidity-venues/1inch";

const TEST_EXECUTOR_ADDRESS =
  "0x1111111111111111111111111111111111111111" as Address;
const TEST_ORIGIN_ADDRESS =
  "0x2222222222222222222222222222222222222222" as Address;
const TEST_SRC =
  "0x3333333333333333333333333333333333333333" as Address;
const TEST_DST =
  "0x4444444444444444444444444444444444444444" as Address;

describe("1inch slippage mapping", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends slippagePercentage as raw percent value to 1inch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        dstAmount: "999",
        tx: {
          to: "0x111111125421ca6dc452d289314280a0f8842a65",
          value: "0",
          data: "0x",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const approveSpy = vi.fn().mockReturnThis();
    const pushCallSpy = vi.fn().mockReturnThis();
    const encoder = {
      address: TEST_EXECUTOR_ADDRESS,
      client: {
        chain: { id: 1 },
        account: { address: TEST_ORIGIN_ADDRESS },
      },
      erc20Approve: approveSpy,
      pushCall: pushCallSpy,
    } as unknown as ExecutorEncoder;

    const venue = new OneInch();
    await venue.convert(encoder, {
      src: TEST_SRC,
      dst: TEST_DST,
      srcAmount: 1_000_000n,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [urlArg] = fetchMock.mock.calls[0]!;
    const requestUrl = new URL(String(urlArg));

    expect(requestUrl.searchParams.get("slippage")).toBe("1");
    expect(requestUrl.searchParams.get("src")).toBe(TEST_SRC);
    expect(requestUrl.searchParams.get("dst")).toBe(TEST_DST);
    expect(approveSpy).toHaveBeenCalledOnce();
    expect(pushCallSpy).toHaveBeenCalledOnce();
  });
});
