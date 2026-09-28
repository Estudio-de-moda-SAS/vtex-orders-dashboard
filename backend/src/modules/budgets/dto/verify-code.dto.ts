import { IsNotEmpty, IsString } from 'class-validator';

/** DTO de entrada para POST /api/budgets/verify-code — la validación real la hace `BudgetCodeGuard`. */
export class VerifyCodeDto {
  @IsNotEmpty({ message: 'code es obligatorio' })
  @IsString()
  code!: string;
}
