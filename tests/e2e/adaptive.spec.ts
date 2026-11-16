import { test, expect } from '@playwright/test'
import ExcelJS from 'exceljs'
import path from 'node:path'
import { readFile } from 'node:fs/promises'

const examples=process.env.SHEETQUO_WCCE_EXAMPLES
for(const imported of [false,true]) {
  test('adaptive quote with a business logo '+(imported?'and the WCCE design':'without uploading a template'), async({page})=>{
    test.skip(imported && !examples,'Private WCCE example available only in local QA.')
    await page.goto('/businesses/new')
    await page.getByRole('textbox',{name:'Business name',exact:true}).fill('Sample Parts')
    await page.getByLabel('Address (optional)').fill('Sample Street')
    await page.getByLabel('Logo (optional)').setInputFiles({name:'test-logo.png',mimeType:'image/png',
      buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAHQAAAAqCAIAAADtfOj3AAADOUlEQVR4nO2aW0gUURjHv9HdDDQz00AEM1wrMh+kgkiNHmpRM7K8YJG3zBuUqbGaaWBBaN4y7UFb3dQumrqWZV5WjWJbL5EumauWSdZDaCqIbDed3QkbEFl3YyuPoH6/p3Nm/t8M8+NwOHNmKLt9fEDIYEDougjKJQuOXIJw5nZKKqJJ3mtFEOSXq12uxjnkb9EYnTgtEATlEgTlEgTlEgTlEgTlEgTlEgTlEgTlEgTlEgTlEkRzb2Gh4Ls6B3t7AcAOx+2db3oAoPTBo8xEQXf/WzbQLGsXVYod7HmC8FAuh0OrVOfTsxy3bJ5f1fBcCgDy2monz6Nzb+Hjzg84cnh6eprL5ZaIH1Y3NgGAv6eH30F3lUo1qVQmZeUMj47pSi5huRKpTCKVsVKOxwjYg6mC2Nk2S1rCubDEi8OjY257XRKjwqMvXZlfpRXXXTt9PdwC4hImlUpTExNh6uWRsTGKoviuzn5nYmmajjjmlxYfFyy4oDUp65TD0pWrJ+vNzIxWrZoZyK3t4xMT+pYBhPn7pOULJ5VKAJhUKq/mF54NCWQYdXZRMU3TAHCn5rGTwzZDAwOtyRUhN6vwVnlu9rOOlzVNLe3y1/oX8jba9A4MznYVA+/tbW0Yhukf/MAe+frte2Ryiq4kLAqLKpfL4dzLyWDbGUKRXNEnbpA0y1oPuOxJPh0lkcpyi2//25UpimIYxtDQkO2e9PXe77zbwtycHxiqNQnLT+40Tc+dSc3N1tpaW3cpeqvqJU/bOupEBfrLHRj65GDP61L0sl0He97A0MfVRkZb7TZ1978TVYqr6hvbxGW6krDsl2IMA3kpSVYbLAFgnanp55FR/WuF5ZUJkafWGBsDgKmJSXxE6M2yyvLaupiQIA5nZsSc8DqkVqt1JWF5Twtdir5MoSgp8/qNlOQfP6dU6pml2J9r7+dls+3OHkV6QZGVpcXda+lTvxdYpdU1rV1yiqJ4NjZPivK/jI/XNLXQKhUAvHjVOT+5KI8L1NyfQkoqovEb2v+gIRDf0AiCcgmCcgmCcgmCcgmCcgmCcgmCcgmCcgmCcgmCchdx4wb/fya1cYMsLDgtEATlEgTlAjl+AWp7Za8HCoMgAAAAAElFTkSuQmCC','base64')})
    await page.getByRole('button',{name:'Add business',exact:true}).click()
    await expect(page).toHaveURL(/\/businesses$/)
    if (imported) {
      await page.goto('/templates/import')
      await page.getByLabel('Choose file').setInputFiles(path.join(examples!,'Sample-Template-v1-test-15-items.xlsx'))
      await page.getByRole('button',{name:'Import template',exact:true}).click()
      await page.getByRole('link',{name:'Start adaptive quotation'}).click()
    } else await page.goto('/quotation/new')
    await page.getByRole('textbox',{name:'Customer’s message'}).fill([
      'Customer: Ventura Motors','2 pcs Brake Pad - ₱1,200 each','1 pc Oil Filter @ 350','Labor: 500','1 pc Washer @ 25','1 pc Gasket @ 75','Discount: 100',
    ].join('\n'))
    await page.getByRole('button',{name:'Extract details'}).click()
    await page.getByRole('link',{name:'Continue to generate'}).click()
    const preview=page.getByRole('region',{name:'Quotation preview'})
    await expect(preview.getByRole('img',{name:'Business logo'})).toBeVisible()
    await expect(preview.getByText('₱3,250.00',{exact:true})).toBeVisible()
    await expect(preview.getByText('Sample Street',{exact:true})).toBeVisible()
    if(imported) await expect(preview.getByText('PARTS NAME',{exact:true})).toBeVisible()
    await preview.screenshot({style:'[data-sonner-toaster] { visibility: hidden }', path: 'output/adaptive-'+(imported?'imported':'standard')+'-preview.png'})
    const download=page.waitForEvent('download')
    await page.getByRole('button',{name:'Generate Excel',exact:true}).click()
    const bytes=await readFile((await (await download).path())!)
    const book=new ExcelJS.Workbook()
    await book.xlsx.load(bytes as unknown as ExcelJS.Buffer)
    const sheet=book.worksheets[0]
    const heading=Number(sheet.pageSetup.printTitlesRow!.split(':')[0].replace(/\D/g,''))
    expect(sheet.getImages()).toHaveLength(1)
    expect(sheet.getCell('A'+(heading+6)).text).toBe('Subtotal')
    expect(sheet.getCell('F'+(heading+8)).result).toBe(3250)
  })
}

