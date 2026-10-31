import { describe, it, expect } from "vitest";
import { mapGatewayAttachments } from "./inbox.server";

describe("website gateway attachments", () => {
  it("keeps the private path as the stable reference and the signed link separately", () => {
    const [a] = mapGatewayAttachments([
      { path: "enq/msg/RUTENDO CV.pdf", filename: "RUTENDO CV.pdf", size: 69441, content_type: "application/pdf", download_url: "https://files.example/sign/abc" },
    ]);
    expect(a.attachment_id).toBe("enq/msg/RUTENDO CV.pdf");
    expect(a.download_url).toBe("https://files.example/sign/abc");
    expect(a.size_bytes).toBe(69441);
  });

  it("treats an https url field as a download link, not a reference", () => {
    const [a] = mapGatewayAttachments([{ id: "att-1", filename: "image.png", url: "https://files.example/x" }]);
    expect(a.attachment_id).toBe("att-1");
    expect(a.download_url).toBe("https://files.example/x");
  });
});
