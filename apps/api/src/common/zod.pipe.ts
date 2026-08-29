import { HttpException, type PipeTransform } from "@nestjs/common";
import type { ZodTypeAny } from "zod";

/** zod 校验管道：失败 → 422（契约错误），区别于 400（请求格式错误） */
export class ZodBodyPipe<T extends ZodTypeAny> implements PipeTransform<unknown, T extends { _output: infer O } ? O : never> {
  constructor(private readonly schema: T, private readonly status = 422) {}

  transform(value: unknown): T extends { _output: infer O } ? O : never {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const issue = result.error.issues[0];
      const message = issue
        ? `${issue.path.join(".") || "body"}: ${issue.message}`
        : "invalid body";
      throw new HttpException({ statusCode: this.status, message }, this.status);
    }
    return result.data;
  }
}

export function httpStatusOf(e: unknown): number | undefined {
  return (e as { status?: number })?.status;
}
